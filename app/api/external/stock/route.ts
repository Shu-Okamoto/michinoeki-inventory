import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/db'
import { ORG } from '@/lib/users'
import { listTransactions, applyStockReport } from '@/lib/transactions'

// 日報システム連携用API（店舗から報告された「在庫（棚残）」を取り込む）。
//
// 日報には店舗×商品ごとの残数が記載される。販売数はポータル側で
//   販売数 = 納品数 −（引取・惣菜・割引・廃棄）− 報告された在庫
// として算出する。在庫は「その時点の状態」なので、同じ日報を何度送っても結果は同じ（冪等）。
// 同じ商品が複数回に分けて納品されている場合は、古い納品から売れたものとみなす。
//
// 前提：先に出荷・納品の登録（どの店舗に何個入れたか）が済んでいること。
//
// 認証: ヘッダ X-API-KEY が EXTERNAL_API_KEY（環境変数）または settings.externalApiKey と一致すること。
//
// GET  /api/external/stock?seller=道の駅A
//   その店舗で現在販売中の商品と在庫（日報に記載してもらう対象）を返す。
//
// POST /api/external/stock
//   { seller, date?, source?, items: [{ product, stock, producer? }] }
//   日報に記載がない商品は変更しない（書き漏れで販売数が勝手に増えないようにするため）。
export const maxDuration = 30

async function authorized(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-api-key') || ''
  if (!key) return false
  if (process.env.EXTERNAL_API_KEY && key === process.env.EXTERNAL_API_KEY) return true
  const settings: any = await kvGet(ORG, 'settings') || {}
  return !!settings.externalApiKey && key === settings.externalApiKey
}

const stockOf = (t: any) => Math.round(Math.max(0,
  (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0)
  - (t.souzaiQty || 0) - (t.discountQty || 0) - (t.discardQty || 0)) * 10) / 10

export async function GET(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const seller = new URL(req.url).searchParams.get('seller') || ''
  if (!seller) return NextResponse.json({ error: 'seller is required' }, { status: 400 })

  const all = await listTransactions(ORG, { seller })
  const active = all.filter(t => t.type !== '卸売' && ['confirmed', 'sales_entered'].includes(t.status))

  // 日報は店舗×商品ごとの残数なので、商品（＋生産者）単位にまとめて返す
  const map = new Map<string, any>()
  for (const t of active) {
    const key = JSON.stringify([t.product, t.producer])
    if (!map.has(key)) {
      map.set(key, { product: t.product, producer: t.producer, unit: t.unit || '', delivered: 0, sold: 0, stock: 0, lots: 0 })
    }
    const g = map.get(key)
    g.delivered += Number(t.deliveryQty) || 0
    g.sold += Number(t.salesQty) || 0
    g.stock += stockOf(t)
    g.lots += 1
  }
  const r1 = (n: number) => Math.round(n * 10) / 10
  return NextResponse.json({
    seller,
    items: Array.from(map.values())
      .map(g => ({ ...g, delivered: r1(g.delivered), sold: r1(g.sold), stock: r1(g.stock) }))
      .sort((a, b) => String(a.product).localeCompare(String(b.product), 'ja')),
  })
}

export async function POST(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })

  const seller = String(body.seller || '')
  if (!seller) return NextResponse.json({ error: 'seller is required' }, { status: 400 })
  const date = String(body.date || new Date().toISOString().slice(0, 10))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date は YYYY-MM-DD 形式で指定してください' }, { status: 400 })
  }

  // 1件だけ送る形（{ product, stock }）も受け付ける
  const items: any[] = Array.isArray(body.items)
    ? body.items
    : (body.product !== undefined ? [{ product: body.product, stock: body.stock, producer: body.producer }] : [])
  if (items.length === 0) {
    return NextResponse.json({ error: 'items（product と stock の配列）が必要です' }, { status: 400 })
  }

  const results: any[] = []
  const errors: any[] = []
  for (const item of items) {
    const product = String(item?.product || '')
    const stock = Number(item?.stock)
    if (!product) { errors.push({ product: item?.product ?? null, error: 'product が必要です' }); continue }
    if (!Number.isFinite(stock) || stock < 0) {
      errors.push({ product, error: 'stock は0以上の数値で指定してください' }); continue
    }
    try {
      const r = await applyStockReport(ORG, {
        seller, product, producer: item?.producer ? String(item.producer) : undefined, date, stock,
      })
      results.push({
        product: r.product, producer: r.producer, date: r.date,
        reportedStock: r.reportedStock, acceptedStock: r.acceptedStock,
        totalSellable: r.totalSellable,
        salesBefore: r.totalSalesBefore, salesAfter: r.totalSalesAfter,
        soldThisReport: Math.round((r.totalSalesAfter - r.totalSalesBefore) * 10) / 10,
        clamped: r.clamped,
        lots: r.lines.map(l => ({ transactionId: l.transactionId, salesQty: l.salesQtyAfter, stock: l.stockAfter, soldOut: l.soldOut })),
      })
    } catch (e: any) {
      errors.push({ product, error: e?.message || '反映に失敗しました' })
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    seller, date,
    summary: { total: items.length, applied: results.length, failed: errors.length },
    results,
    errors,
  })
}
