import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet } from '@/lib/db'
import { ORG } from '@/lib/users'
import {
  createTransaction, confirmTransaction, enterSales, completeTransaction,
  cancelTransaction, patchTransaction, deleteTransaction, listTransactions,
  generateInvoices, listInvoices, TxStatus,
} from '@/lib/transactions'

const ADMIN = '組合管理者'

async function defaults(product: string) {
  const products: any[] = await kvGet(ORG, 'products') || []
  const settings: any = await kvGet(ORG, 'settings') || {}
  const unitPrice = Number(products.find((p: any) => p.name === product)?.unitPrice) || 0
  const commissionRate = settings.commissionRate != null ? Number(settings.commissionRate) : 8
  return { unitPrice, commissionRate }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = (searchParams.get('status') || undefined) as TxStatus | undefined
  const period = searchParams.get('period') || undefined
  const [transactions, invoices] = await Promise.all([
    listTransactions(ORG, { status, period }),
    listInvoices(ORG, period),
  ])
  const role = (session.user as any)?.role || 'guest'
  return NextResponse.json({ transactions, invoices, me: { name: session.user?.name || '', role } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role || 'guest'
  const { action, payload } = await req.json()
  const deny = () => NextResponse.json({ error: '権限がありません' }, { status: 403 })

  switch (action) {
    case 'create': {
      // 出荷登録（生産者または組合）
      if (role !== '生産者' && role !== ADMIN) return deny()
      const d = await defaults(payload.product)
      const id = await createTransaction(ORG, {
        type: payload.type || '産直',
        date: payload.date || new Date().toISOString().slice(0, 10),
        producer: payload.producer || (role === '生産者' ? (session.user?.name || '') : ''),
        seller: payload.seller || '',
        location: payload.location || '',
        product: payload.product,
        shipQty: Number(payload.shipQty) || 0,
        unitPrice: payload.unitPrice != null ? Number(payload.unitPrice) : d.unitPrice,
        commissionRate: payload.commissionRate != null ? Number(payload.commissionRate) : d.commissionRate,
      })
      return NextResponse.json({ ok: true, id })
    }
    case 'confirm': {
      // 組合が納品数を確定・調整
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
      // 販売者が販売数を入力
      if (role !== '販売者' && role !== ADMIN) return deny()
      await enterSales(ORG, payload.id, Number(payload.salesQty) || 0)
      return NextResponse.json({ ok: true })
    }
    case 'complete': {
      // 販売者が確認OK → 成立
      if (role !== '販売者' && role !== ADMIN) return deny()
      await completeTransaction(ORG, payload.id)
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
