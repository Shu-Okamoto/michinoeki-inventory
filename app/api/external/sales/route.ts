import { NextRequest, NextResponse } from 'next/server'
import { kvGet } from '@/lib/db'
import { ORG } from '@/lib/users'
import {
  listTransactions, addSales, discountSaleTransaction, souzaiTransaction, discardTransaction,
} from '@/lib/transactions'

// 外部システム連携用API（販売者の日報・POS等から売上を自動登録する）。
// 認証: ヘッダ X-API-KEY が EXTERNAL_API_KEY（環境変数）または settings.externalApiKey と一致すること。
//
// POST /api/external/sales
//   { seller, product, qty, producer?, date?, channel? }
//   channel: 'sales'(既定) | 'discount' | 'souzai' | 'discard'
//   ※ discount は discountUnitPrice 必須（半額〜定価にクランプ）
//   該当する「販売中」の取引（seller+product[+producer] が一致・古い順）に数量を計上する。
//
// GET /api/external/sales?seller=◯◯
//   その販売者の「販売中」取引（商品・棚残）一覧を返す（連携側の入力候補用）。
export const maxDuration = 30

async function authorized(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-api-key') || ''
  if (!key) return false
  if (process.env.EXTERNAL_API_KEY && key === process.env.EXTERNAL_API_KEY) return true
  const settings: any = await kvGet(ORG, 'settings') || {}
  return !!settings.externalApiKey && key === settings.externalApiKey
}

const shelf = (t: any) => Math.max(0, (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0) - (t.souzaiQty || 0) - (t.discountQty || 0) - (t.discardQty || 0))

export async function GET(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const seller = new URL(req.url).searchParams.get('seller') || ''
  if (!seller) return NextResponse.json({ error: 'seller is required' }, { status: 400 })
  const all = await listTransactions(ORG, { seller })
  const active = all.filter(t => ['confirmed', 'sales_entered'].includes(t.status))
  return NextResponse.json({
    transactions: active.map(t => ({
      id: t.id, date: t.date, producer: t.producer, product: t.product, unit: t.unit || '',
      deliveryQty: t.deliveryQty, salesQty: t.salesQty, shelf: shelf(t), status: t.status,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!await authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  const { seller, product, producer, qty, date, channel, discountUnitPrice, transactionId } = body
  const q = Number(qty) || 0
  if (!seller || !product || q <= 0) {
    return NextResponse.json({ error: 'seller, product, qty(>0) are required' }, { status: 400 })
  }

  // 対象取引の特定: transactionId 指定があればそれ、なければ seller+product(+producer) の販売中を古い順(FIFO)
  const all = await listTransactions(ORG, { seller })
  const candidates = all
    .filter(t => ['confirmed', 'sales_entered'].includes(t.status))
    .filter(t => t.product === product && (!producer || t.producer === producer))
    .filter(t => !transactionId || t.id === transactionId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const target = candidates.find(t => shelf(t) > 0)
  if (!target) return NextResponse.json({ error: '該当する販売中の取引（棚残あり）が見つかりません' }, { status: 404 })

  const ch = channel || 'sales'
  if (ch === 'sales') {
    await addSales(ORG, target.id, q, date)
  } else if (ch === 'discount') {
    await discountSaleTransaction(ORG, target.id, (target.discountQty || 0) + q, Number(discountUnitPrice) || 0)
  } else if (ch === 'souzai') {
    await souzaiTransaction(ORG, target.id, (target.souzaiQty || 0) + q)
  } else if (ch === 'discard') {
    await discardTransaction(ORG, target.id, (target.discardQty || 0) + q)
  } else {
    return NextResponse.json({ error: 'unknown channel' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, transactionId: target.id, channel: ch, qty: q })
}
