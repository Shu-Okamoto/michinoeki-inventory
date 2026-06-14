import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet } from '@/lib/db'
import { ORG } from '@/lib/users'
import {
  createTransaction, confirmTransaction, gradeTransaction, enterSales, addSales, completeTransaction,
  retrieveTransaction, souzaiTransaction, discountSaleTransaction, discardTransaction,
  distributeTransaction,
  cancelTransaction, patchTransaction, deleteTransaction,
  listTransactions, generateInvoices, listInvoices, TxStatus,
} from '@/lib/transactions'

// コールドスタート時のDB起動待ちで504にならないよう関数の上限時間を延長
export const maxDuration = 30

const ADMIN = '組合管理者'

// ロール別の情報統制：相手側の金額・手数料はレスポンスから除去する。
//  生産者: 自分の受取額(満額)は見えるが、手数料・販売者請求は見えない
//  販売者: 自分の支払(請求)額は見えるが、生産者請求・手数料は見えない
//  組合管理者: すべて見える
function redactByRole(t: any, role: string) {
  if (role === ADMIN) return t
  const c = { ...t }
  if (role === '生産者') {
    delete c.commission; delete c.commissionRate; delete c.sellerAmount
  } else if (role === '販売者') {
    delete c.commission; delete c.commissionRate; delete c.producerAmount
    delete c.amount; delete c.retailAmount; delete c.discountAmount; delete c.souzaiAmount
    delete c.gradeAPrice; delete c.gradeBPrice
  } else {
    // guest 等：金額情報はすべて除去
    delete c.commission; delete c.commissionRate; delete c.producerAmount; delete c.sellerAmount
    delete c.amount; delete c.retailAmount; delete c.discountAmount; delete c.souzaiAmount
    delete c.gradeAPrice; delete c.gradeBPrice
  }
  return c
}

async function defaults(product: string, producer?: string) {
  const products: any[] = await kvGet(ORG, 'products') || []
  const settings: any = await kvGet(ORG, 'settings') || {}
  // 生産者＋商品名で優先解決（同名商品が複数生産者にある場合に対応）。なければ商品名一致。
  const p = (producer && products.find((x: any) => x.name === product && (x.producer || '') === producer))
    || products.find((x: any) => x.name === product)
  const unitPrice = Number(p?.unitPrice) || 0
  const unit = p?.unit || ''
  const commissionRate = settings.commissionRate != null ? Number(settings.commissionRate) : 8
  return { unitPrice, unit, commissionRate }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role || 'guest'
  const myName = session.user?.name || ''
  const { searchParams } = new URL(req.url)
  const status = (searchParams.get('status') || undefined) as TxStatus | undefined
  const period = searchParams.get('period') || undefined
  // 自分宛ての取引だけを返す（生産者=自分が生産者 / 販売者=自分が販売者 / 組合=全部）
  const scope: { producer?: string; seller?: string } = {}
  if (role === '生産者') scope.producer = myName
  else if (role === '販売者') scope.seller = myName
  else if (role !== ADMIN) {
    return NextResponse.json({ transactions: [], invoices: [], me: { name: myName, role } })
  }
  const [transactions, invoices] = await Promise.all([
    listTransactions(ORG, { status, period, ...scope }),
    role === ADMIN ? listInvoices(ORG, period) : Promise.resolve([]),
  ])
  return NextResponse.json({
    transactions: transactions.map(t => redactByRole(t, role)),
    invoices, // 請求書バッチ（手数料等を含む）は組合管理者のみ
    me: { name: session.user?.name || '', role },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role || 'guest'
  const { action, payload } = await req.json()
  const deny = () => NextResponse.json({ error: '権限がありません' }, { status: 403 })

  switch (action) {
    case 'create': {
      // 出荷登録(産直委託・生産者/組合) / 納品登録(買取・組合のみ)
      if (role !== '生産者' && role !== ADMIN) return deny()
      if ((payload.type || '産直') === '卸売' && role !== ADMIN) return deny()
      const producerName = payload.producer || (role === '生産者' ? (session.user?.name || '') : '')
      const d = await defaults(payload.product, producerName)
      const id = await createTransaction(ORG, {
        type: payload.type || '産直',
        date: payload.date || new Date().toISOString().slice(0, 10),
        producer: producerName,
        seller: payload.seller || '',
        location: payload.location || '',
        product: payload.product,
        shipQty: Number(payload.shipQty) || 0,
        unit: payload.unit != null ? payload.unit : d.unit,
        unitPrice: payload.unitPrice != null ? Number(payload.unitPrice) : d.unitPrice,
        commissionRate: payload.commissionRate != null ? Number(payload.commissionRate) : d.commissionRate,
      })
      return NextResponse.json({ ok: true, id })
    }
    case 'distribute': {
      // 組合宛て出荷の検品・分配（組合のみ）。複数販売先へ納品先・納品数を割当て販売中へ
      if (role !== ADMIN) return deny()
      const result = await distributeTransaction(ORG, payload.id, payload.allocations || [])
      return NextResponse.json({ ok: true, ...result })
    }
    case 'inspect': {
      // 出荷確認・検品OK（販売者）。検品数を納品数として確定し販売中へ。産直委託向け。
      if (role !== '販売者' && role !== ADMIN) return deny()
      await confirmTransaction(ORG, payload.id, { deliveryQty: Number(payload.deliveryQty) || 0 })
      return NextResponse.json({ ok: true })
    }
    case 'grade': {
      // 買取の検品（組合）：A品/B品(等級別単価)・廃棄数を入力
      if (role !== ADMIN) return deny()
      await gradeTransaction(ORG, payload.id, {
        aQty: Number(payload.aQty) || 0, aPrice: Number(payload.aPrice) || 0,
        bQty: Number(payload.bQty) || 0, bPrice: Number(payload.bPrice) || 0,
        discardQty: Number(payload.discardQty) || 0,
        confirmedQty: payload.confirmedQty != null ? Number(payload.confirmedQty) : undefined,
        deliveryQty: payload.deliveryQty != null ? Number(payload.deliveryQty) : undefined,
        commissionRate: payload.commissionRate != null ? Number(payload.commissionRate) : undefined,
        complete: !!payload.complete,
      })
      return NextResponse.json({ ok: true })
    }
    case 'confirm': {
      // 組合が納品数を確定・調整（買取/卸売の仕切り）
      if (role !== ADMIN) return deny()
      await confirmTransaction(ORG, payload.id, {
        deliveryQty: Number(payload.deliveryQty) || 0,
        unitPrice: payload.unitPrice != null ? Number(payload.unitPrice) : undefined,
        commissionRate: payload.commissionRate != null ? Number(payload.commissionRate) : undefined,
        location: payload.location,
      })
      return NextResponse.json({ ok: true })
    }
    case 'enter_sales': {
      // 販売者が販売数を入力（累積の絶対値で設定）
      if (role !== '販売者' && role !== ADMIN) return deny()
      await enterSales(ORG, payload.id, Number(payload.salesQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      // 売上登録：その日の販売数を加算（残数があれば翌日も進行中として継続）
      if (role !== '販売者' && role !== ADMIN) return deny()
      await addSales(ORG, payload.id, Number(payload.addQty) || 0, payload.date)
      return NextResponse.json({ ok: true })
    }
    case 'complete': {
      // 販売者が確認OK → 成立
      if (role !== '販売者' && role !== ADMIN) return deny()
      await completeTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'retrieve': {
      // 引取依頼の数量確定（販売者が確定／生産者・組合も可）。産直のみ
      if (role !== '販売者' && role !== '生産者' && role !== ADMIN) return deny()
      await retrieveTransaction(ORG, payload.id, Number(payload.retrievedQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'souzai': {
      // 惣菜利用（3割価格で買取）。産直のみ
      if (role !== '販売者' && role !== ADMIN) return deny()
      await souzaiTransaction(ORG, payload.id, Number(payload.souzaiQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'discount_sale': {
      // 割引販売（半額〜定価）。産直のみ
      if (role !== '販売者' && role !== ADMIN) return deny()
      await discountSaleTransaction(ORG, payload.id, Number(payload.discountQty) || 0, Number(payload.discountUnitPrice) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'discard': {
      // 廃棄（無償・棚残から減算）。産直のみ
      if (role !== '販売者' && role !== ADMIN) return deny()
      await discardTransaction(ORG, payload.id, Number(payload.discardQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'cancel': {
      if (role !== ADMIN) return deny()
      await cancelTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'patch': {
      if (role !== ADMIN) return deny()
      await patchTransaction(ORG, payload.id, payload.fields || {})
      return NextResponse.json({ ok: true })
    }
    case 'delete': {
      if (role !== ADMIN) return deny()
      await deleteTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'generate_invoices': {
      // 月末締め（組合のみ）
      if (role !== ADMIN) return deny()
      const result = await generateInvoices(ORG, payload.period)
      return NextResponse.json({ ok: true, result })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
