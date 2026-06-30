import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet } from '@/lib/db'
import { ORG, isAdminRole, isPartnerRole, hasOperationalAccess } from '@/lib/users'
import {
  createTransaction, confirmTransaction, gradeTransaction, enterSales, addSales, completeTransaction, confirmProducer,
  retrieveTransaction, souzaiTransaction, discountSaleTransaction, discardTransaction,
  distributeTransaction,
  cancelTransaction, patchTransaction, deleteTransaction, getTransaction,
  listTransactions, generateInvoices, listInvoices, setInvoiceTransferred, TxStatus,
} from '@/lib/transactions'

// コールドスタート時のDB起動待ちで504にならないよう関数の上限時間を延長
export const maxDuration = 30

// ロール別の情報統制：相手側の金額・手数料はレスポンスから除去する。
//  生産者: 自分の受取額(満額)は見えるが、手数料・販売者請求は見えない
//  販売者: 自分の支払(請求)額は見えるが、生産者請求・手数料は見えない
//  admin / 組合パートナー: すべて見える
function redactByRole(t: any, role: string) {
  if (hasOperationalAccess(role)) return t
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
  // 生産者が商品名を指定した場合は同商品の全生産者分も返す（出荷分析用）
  const filterProduct = searchParams.get('product') || undefined
  const scope: { producer?: string; seller?: string } = {}
  if (role === '生産者') {
    if (!filterProduct) scope.producer = myName
    // filterProduct 指定時はscopeなし（同商品の全生産者分を取得）
  } else if (role === '販売者') scope.seller = myName
  else if (!hasOperationalAccess(role)) {
    return NextResponse.json({ transactions: [], invoices: [], me: { name: myName, role } })
  }
  const [transactions, invoices] = await Promise.all([
    listTransactions(ORG, { status, period, product: filterProduct, ...scope }),
    isAdminRole(role) ? listInvoices(ORG, period) : Promise.resolve([]),
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
      // 出荷登録(産直委託・生産者/組合パートナー/admin) / 納品登録(買取・組合パートナー/adminのみ)
      if (role !== '生産者' && !hasOperationalAccess(role)) return deny()
      if ((payload.type || '産直') === '卸売' && !hasOperationalAccess(role)) return deny()
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
      // 組合宛て出荷の検品・分配（組合パートナー/admin）。複数販売先へ納品先・納品数を割当て販売中へ
      if (!hasOperationalAccess(role)) return deny()
      const result = await distributeTransaction(ORG, payload.id, payload.allocations || [])
      return NextResponse.json({ ok: true, ...result })
    }
    case 'inspect': {
      // 出荷確認・検品OK（販売者 / 組合パートナー / admin）。検品数を納品数として確定し販売中へ。産直委託向け。
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await confirmTransaction(ORG, payload.id, { deliveryQty: Number(payload.deliveryQty) || 0 })
      return NextResponse.json({ ok: true })
    }
    case 'grade': {
      // 買取の検品（組合パートナー / admin）：A品/B品(等級別単価)・廃棄数を入力
      if (!hasOperationalAccess(role)) return deny()
      const aQty = Number(payload.aQty) || 0, bQty = Number(payload.bQty) || 0, discardQty = Number(payload.discardQty) || 0
      const confirmedQty = payload.confirmedQty != null ? Number(payload.confirmedQty) : 0
      // 納品数（今回の入力値があればそれ、なければ既存値）を上限に検証
      let dq = payload.deliveryQty != null ? Number(payload.deliveryQty) : NaN
      if (!Number.isFinite(dq)) { const cur = await getTransaction(ORG, payload.id); dq = cur?.deliveryQty || 0 }
      const r1 = (n: number) => Math.round(n * 10) / 10
      if (dq > 0 && r1(confirmedQty) > r1(dq)) {
        return NextResponse.json({ error: `納品確認数(${confirmedQty})が納品数(${dq})を超えています` }, { status: 400 })
      }
      if (dq > 0 && r1(aQty + bQty + discardQty) > r1(dq)) {
        return NextResponse.json({ error: `検品数 A品+B品+不良品(${aQty + bQty + discardQty})が納品数(${dq})を超えています` }, { status: 400 })
      }
      await gradeTransaction(ORG, payload.id, {
        aQty, aPrice: Number(payload.aPrice) || 0,
        bQty, bPrice: Number(payload.bPrice) || 0,
        discardQty,
        confirmedQty: payload.confirmedQty != null ? Number(payload.confirmedQty) : undefined,
        deliveryQty: payload.deliveryQty != null ? Number(payload.deliveryQty) : undefined,
        commissionRate: payload.commissionRate != null ? Number(payload.commissionRate) : undefined,
        complete: !!payload.complete,
      })
      return NextResponse.json({ ok: true })
    }
    case 'confirm': {
      // 組合が納品数を確定・調整（組合パートナー / admin）
      if (!hasOperationalAccess(role)) return deny()
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
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await enterSales(ORG, payload.id, Number(payload.salesQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      // 売上登録：その日の販売数を加算（残数があれば翌日も進行中として継続）
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await addSales(ORG, payload.id, Number(payload.addQty) || 0, payload.date)
      return NextResponse.json({ ok: true })
    }
    case 'complete': {
      // 販売者が確認OK → 成立
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await completeTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'retrieve': {
      // 引取依頼の数量確定（販売者が確定／生産者・組合も可）。産直のみ
      if (role !== '販売者' && role !== '生産者' && !hasOperationalAccess(role)) return deny()
      await retrieveTransaction(ORG, payload.id, Number(payload.retrievedQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'souzai': {
      // 惣菜利用（3割価格で買取）。産直のみ
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await souzaiTransaction(ORG, payload.id, Number(payload.souzaiQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'discount_sale': {
      // 割引販売（半額〜定価）。産直のみ
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await discountSaleTransaction(ORG, payload.id, Number(payload.discountQty) || 0, Number(payload.discountUnitPrice) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'discard': {
      // 廃棄（無償・棚残から減算）。産直のみ
      if (role !== '販売者' && !hasOperationalAccess(role)) return deny()
      await discardTransaction(ORG, payload.id, Number(payload.discardQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'producer_confirm': {
      // 生産者が成立内容を確認 → 請求書作成の対象へ（組合パートナー / admin も代行可）
      if (role !== '生産者' && !hasOperationalAccess(role)) return deny()
      await confirmProducer(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'cancel': {
      if (!hasOperationalAccess(role)) return deny()
      await cancelTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'patch': {
      if (!hasOperationalAccess(role)) return deny()
      await patchTransaction(ORG, payload.id, payload.fields || {})
      return NextResponse.json({ ok: true })
    }
    case 'delete': {
      if (!isAdminRole(role)) return deny()
      await deleteTransaction(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'generate_invoices': {
      // 月末締め（adminのみ）
      if (!isAdminRole(role)) return deny()
      const result = await generateInvoices(ORG, payload.period)
      return NextResponse.json({ ok: true, result })
    }
    case 'mark_transferred': {
      // 生産者請求書の振込済みフラグ更新（振込管理・adminのみ）
      if (!isAdminRole(role)) return deny()
      await setInvoiceTransferred(ORG, payload.id, !!payload.transferred, payload.date)
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
