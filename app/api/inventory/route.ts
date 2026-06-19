import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/db'
import { listSales, addSales, deleteSale, clearSales, listShipments, addShipment, deleteShipment } from '@/lib/records'
import { ORG, hashPassword, roleToView } from '@/lib/users'
import { sendSalesDigest } from '@/lib/salesmail'

// コールドスタート時のDB起動待ちで504にならないよう関数の上限時間を延長
export const maxDuration = 30

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

// 道の駅(locations)を {id, name, producer} に正規化（旧データの文字列にも対応）
function normLocations(list: any[]): any[] {
  return (list || []).map((l: any) => typeof l === 'string'
    ? { id: l, name: l, producer: '' }
    : { id: l.id || l.name, name: l.name, producer: l.producer || '' })
}

// 商品マスタの単価を引く（売上/出荷登録時に単価をスナップショットするため）
async function productPriceMap(): Promise<Record<string, number>> {
  const products: any[] = await kvGet(ORG, 'products') || []
  const map: Record<string, number> = {}
  for (const p of products) map[p.name] = Number(p.unitPrice) || 0
  return map
}
async function productPrice(name: string, producer?: string): Promise<number> {
  const products: any[] = await kvGet(ORG, 'products') || []
  // 生産者＋商品名で優先解決。なければ商品名一致。
  const hit = (producer && products.find((p: any) => p.name === name && (p.producer || '') === producer))
    || products.find((p: any) => p.name === name)
  return Number(hit?.unitPrice) || 0
}

const KEYS = ['locations', 'products', 'shipments', 'sales', 'gmail_settings', 'producers', 'announcements', 'settings']

// 旧（ログインアカウントごと）データを共有領域へ一度だけ移行する
async function migrateLegacy(legacyUserId?: string | null) {
  if (!legacyUserId || legacyUserId === ORG) return
  if (await kvGet(ORG, '_migrated')) return
  for (const key of KEYS) {
    const orgVal = await kvGet(ORG, key)
    if (orgVal == null) {
      const legacy = await kvGet(legacyUserId, key)
      if (legacy != null) await kvSet(ORG, key, legacy)
    }
  }
  await kvSet(ORG, '_migrated', true)
}

// passwordHash を除いた安全な組合員一覧
function sanitizeProducers(list: any[]): any[] {
  return (list || []).map(({ passwordHash, ...rest }: any) => ({ ...rest, hasLogin: !!rest.loginId }))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await migrateLegacy(session.user?.email)

  const [locations, products, shipments, sales, gmailSettings, producers, announcements, settings] = await Promise.all([
    kvGet(ORG, 'locations'),
    kvGet(ORG, 'products'),
    listShipments(ORG),
    listSales(ORG),
    kvGet(ORG, 'gmail_settings'),
    kvGet(ORG, 'producers'),
    kvGet(ORG, 'announcements'),
    kvGet(ORG, 'settings'),
  ])

  const role = (session.user as any)?.role || 'guest'
  return NextResponse.json({
    locations: normLocations(locations as any[]),
    products: products || [],
    shipments: shipments || [],
    sales: sales || [],
    gmailSettings: gmailSettings || { labelId: '', labelName: '', autoFetch: false },
    producers: sanitizeProducers(producers as any[]),
    announcements: announcements || [],
    settings: settings || { kyohaiUrl: '' },
    me: { name: session.user?.name || '', role, view: roleToView(role), email: session.user?.email || '' },
  })
}

// 管理者のみ許可されるアクション
const ADMIN_ACTIONS = new Set([
  'add_product', 'remove_product', 'update_product',
  'approve_product', 'reject_product',
  'add_producer', 'update_producer', 'remove_producer',
  'add_announcement', 'remove_announcement',
  'save_settings', 'save_gmail_settings', 'clear_sales', 'send_sales_mail',
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role || 'guest'

  const body = await req.json()
  const { action, payload } = body

  if (ADMIN_ACTIONS.has(action) && role !== '組合管理者') {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  switch (action) {
    case 'add_location': {
      // 道の駅の登録。生産者は自分の道の駅、組合は共通(ワークフローでも使用)。
      if (role !== '生産者' && role !== '組合管理者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      if (!payload.name) return NextResponse.json({ error: '名称が必要です' }, { status: 400 })
      const list = normLocations(await kvGet(ORG, 'locations') || [])
      const producer = role === '生産者' ? (session.user?.name || '') : (payload.producer || '')
      if (!list.find((l: any) => l.name === payload.name && (l.producer || '') === producer)) {
        list.push({ id: uid(), name: payload.name, producer })
      }
      await kvSet(ORG, 'locations', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_location': {
      if (role !== '生産者' && role !== '組合管理者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const me = session.user?.name || ''
      const list = normLocations(await kvGet(ORG, 'locations') || [])
      const filtered = list.filter((l: any) => {
        const hit = payload.id ? l.id === payload.id : l.name === payload.name
        if (!hit) return true
        // 生産者は自分の道の駅のみ削除可
        if (role !== '組合管理者' && (l.producer || '') !== me) return true
        return false
      })
      await kvSet(ORG, 'locations', filtered)
      return NextResponse.json({ ok: true })
    }
    case 'add_producer': {
      const list: any[] = await kvGet(ORG, 'producers') || []
      const rec: any = { id: uid(), name: payload.name, role: payload.role || '生産者', company: payload.company || '', email: payload.email || '', phone: payload.phone || '', note: payload.note || '', loginId: payload.loginId || '' }
      if (payload.password) rec.passwordHash = hashPassword(payload.password)
      list.push(rec)
      await kvSet(ORG, 'producers', list)
      return NextResponse.json({ ok: true })
    }
    case 'update_producer': {
      const list: any[] = await kvGet(ORG, 'producers') || []
      await kvSet(ORG, 'producers', list.map((p: any) => {
        if (p.id !== payload.id) return p
        const { password, ...rest } = payload
        const merged = { ...p, ...rest }
        if (password) merged.passwordHash = hashPassword(password)
        return merged
      }))
      return NextResponse.json({ ok: true })
    }
    case 'remove_producer': {
      const list: any[] = await kvGet(ORG, 'producers') || []
      await kvSet(ORG, 'producers', list.filter((p: any) => p.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'save_settings': {
      const cur: any = await kvGet(ORG, 'settings') || {}
      await kvSet(ORG, 'settings', { ...cur, ...payload })
      return NextResponse.json({ ok: true })
    }
    case 'add_announcement': {
      const list: any[] = await kvGet(ORG, 'announcements') || []
      list.push({ id: uid(), date: payload.date || new Date().toISOString().slice(0, 10), title: payload.title, body: payload.body || '', pinned: !!payload.pinned })
      await kvSet(ORG, 'announcements', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_announcement': {
      const list: any[] = await kvGet(ORG, 'announcements') || []
      await kvSet(ORG, 'announcements', list.filter((a: any) => a.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'add_reply': {
      if (role === 'guest') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      if (!payload.body) return NextResponse.json({ error: '本文が空です' }, { status: 400 })
      const author = session.user?.name || session.user?.email || '匿名'
      const reply = { id: uid(), author, role, body: payload.body, date: new Date().toISOString().slice(0, 10) }
      const list: any[] = await kvGet(ORG, 'announcements') || []
      await kvSet(ORG, 'announcements', list.map((a: any) =>
        a.id === payload.announcementId ? { ...a, replies: [...(a.replies || []), reply] } : a))
      return NextResponse.json({ ok: true })
    }
    case 'remove_reply': {
      const list: any[] = await kvGet(ORG, 'announcements') || []
      const author = session.user?.name || session.user?.email || ''
      await kvSet(ORG, 'announcements', list.map((a: any) => {
        if (a.id !== payload.announcementId) return a
        const replies = (a.replies || []).filter((r: any) =>
          r.id !== payload.replyId || (role !== '組合管理者' && r.author !== author))
        return { ...a, replies }
      }))
      return NextResponse.json({ ok: true })
    }
    case 'add_product': {
      // 組合管理者が新規登録（承認済み）。同名でも生産者が違えば別商品として登録可。
      const list: any[] = await kvGet(ORG, 'products') || []
      const unitPrice = Number(payload.unitPrice) || 0
      const dup = list.find((p: any) => p.name === payload.name && (p.producer || '') === (payload.producer || ''))
      if (dup) {
        // 同一生産者・同名は更新（単価・単位）
        if (payload.unit !== undefined) dup.unit = payload.unit || ''
        dup.unitPrice = unitPrice
        dup.status = 'approved'
      } else {
        list.push({ id: uid(), name: payload.name, producer: payload.producer || '', unit: payload.unit || '', unitPrice, status: 'approved' })
      }
      await kvSet(ORG, 'products', list)
      return NextResponse.json({ ok: true })
    }
    case 'update_product': {
      // 既存商品の編集（idで特定。旧データはnameで特定）
      const list: any[] = await kvGet(ORG, 'products') || []
      const p = list.find((x: any) => payload.id ? x.id === payload.id : x.name === payload.name)
      if (p) {
        if (!p.id) p.id = uid()
        if (payload.name !== undefined) p.name = payload.name
        if (payload.producer !== undefined) p.producer = payload.producer || ''
        if (payload.unit !== undefined) p.unit = payload.unit || ''
        if (payload.unitPrice !== undefined) p.unitPrice = Number(payload.unitPrice) || 0
      }
      await kvSet(ORG, 'products', list)
      return NextResponse.json({ ok: true })
    }
    case 'propose_product': {
      // 生産者（または組合管理者）が商品を申請。生産者の申請は「承認待ち」
      if (role !== '生産者' && role !== '組合管理者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      if (!payload.name) return NextResponse.json({ error: '商品名が必要です' }, { status: 400 })
      const list: any[] = await kvGet(ORG, 'products') || []
      // 生産者の申請は自分を生産者に。組合は指定可。
      const producer = role === '生産者' ? (session.user?.name || '') : (payload.producer || '')
      // 同名でも生産者が違えばOK。同一生産者・同名のみ拒否。
      if (list.find((p: any) => p.name === payload.name && (p.producer || '') === producer)) {
        return NextResponse.json({ error: 'この生産者の同名商品が既にあります' }, { status: 400 })
      }
      const status = role === '組合管理者' ? 'approved' : 'pending'
      list.push({
        id: uid(),
        name: payload.name,
        producer,
        unit: payload.unit || '',
        unitPrice: Number(payload.unitPrice) || 0,
        status,
        proposedBy: session.user?.name || '',
      })
      await kvSet(ORG, 'products', list)
      return NextResponse.json({ ok: true, status })
    }
    case 'approve_product': {
      const list: any[] = await kvGet(ORG, 'products') || []
      const p = list.find((x: any) => payload.id ? x.id === payload.id : x.name === payload.name)
      if (p) {
        p.status = 'approved'
        if (!p.id) p.id = uid()
        if (payload.unitPrice !== undefined) p.unitPrice = Number(payload.unitPrice) || 0
        if (payload.unit !== undefined) p.unit = payload.unit || ''
        if (payload.producer !== undefined) p.producer = payload.producer || ''
      }
      await kvSet(ORG, 'products', list)
      return NextResponse.json({ ok: true })
    }
    case 'reject_product': {
      // 承認待ちの申請を却下（削除）
      const list: any[] = await kvGet(ORG, 'products') || []
      await kvSet(ORG, 'products', list.filter((p: any) => {
        const hit = payload.id ? p.id === payload.id : p.name === payload.name
        return !(hit && (p.status || 'approved') === 'pending')
      }))
      return NextResponse.json({ ok: true })
    }
    case 'remove_product': {
      const list: any[] = await kvGet(ORG, 'products') || []
      await kvSet(ORG, 'products', list.filter((p: any) => payload.id ? p.id !== payload.id : p.name !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_shipment': {
      // 納品＝生産者または管理者
      if (role === '販売者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const unitPrice = payload.unitPrice !== undefined ? Number(payload.unitPrice) || 0 : await productPrice(payload.product, payload.producer)
      await addShipment(ORG, { id: uid(), date: payload.date, location: payload.location, producer: payload.producer || '', product: payload.product, qty: Number(payload.qty) || 0, unitPrice })
      return NextResponse.json({ ok: true })
    }
    case 'delete_shipment': {
      if (role === '販売者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      await deleteShipment(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      // レジ通過数＝販売者または管理者
      if (role === '生産者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const priceMap = await productPriceMap()
      const recs = (payload.items || []).map((item: any) => ({
        id: uid(), date: payload.date, location: payload.location, producer: payload.producer || '',
        product: item.product, qty: Number(item.qty) || 0, method: payload.method || '手動',
        unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) || 0 : (priceMap[item.product] || 0),
      }))
      await addSales(ORG, recs)
      return NextResponse.json({ ok: true })
    }
    case 'save_gmail_settings': {
      await kvSet(ORG, 'gmail_settings', payload)
      return NextResponse.json({ ok: true })
    }
    case 'delete_sale': {
      if (role === '生産者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      await deleteSale(ORG, payload.id)
      return NextResponse.json({ ok: true })
    }
    case 'clear_sales': {
      await clearSales(ORG)
      return NextResponse.json({ ok: true })
    }
    case 'send_sales_mail': {
      const summary = await sendSalesDigest(payload?.date)
      return NextResponse.json({ ok: true, summary })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
