import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/db'
import { ORG, hashPassword, roleToView } from '@/lib/users'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

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
    kvGet(ORG, 'shipments'),
    kvGet(ORG, 'sales'),
    kvGet(ORG, 'gmail_settings'),
    kvGet(ORG, 'producers'),
    kvGet(ORG, 'announcements'),
    kvGet(ORG, 'settings'),
  ])

  const role = (session.user as any)?.role || 'guest'
  return NextResponse.json({
    locations: locations || [],
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
  'add_location', 'remove_location', 'add_product', 'remove_product',
  'add_producer', 'update_producer', 'remove_producer',
  'add_announcement', 'remove_announcement',
  'save_settings', 'save_gmail_settings', 'clear_sales',
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
      const list: string[] = await kvGet(ORG, 'locations') || []
      if (!list.includes(payload.name)) list.push(payload.name)
      await kvSet(ORG, 'locations', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_location': {
      const list: string[] = await kvGet(ORG, 'locations') || []
      await kvSet(ORG, 'locations', list.filter((l: string) => l !== payload.name))
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
      const list: any[] = await kvGet(ORG, 'products') || []
      if (!list.find((p: any) => p.name === payload.name)) list.push({ name: payload.name, aliases: payload.aliases || '' })
      await kvSet(ORG, 'products', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_product': {
      const list: any[] = await kvGet(ORG, 'products') || []
      await kvSet(ORG, 'products', list.filter((p: any) => p.name !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_shipment': {
      // 納品＝生産者または管理者
      if (role === '販売者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const list: any[] = await kvGet(ORG, 'shipments') || []
      list.push({ id: uid(), ...payload })
      await kvSet(ORG, 'shipments', list)
      return NextResponse.json({ ok: true })
    }
    case 'delete_shipment': {
      if (role === '販売者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const list: any[] = await kvGet(ORG, 'shipments') || []
      await kvSet(ORG, 'shipments', list.filter((s: any) => s.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      // レジ通過数＝販売者または管理者
      if (role === '生産者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const list: any[] = await kvGet(ORG, 'sales') || []
      for (const item of payload.items) {
        list.push({ id: uid(), date: payload.date, location: payload.location, method: payload.method || '手動', ...item })
      }
      await kvSet(ORG, 'sales', list)
      return NextResponse.json({ ok: true })
    }
    case 'save_gmail_settings': {
      await kvSet(ORG, 'gmail_settings', payload)
      return NextResponse.json({ ok: true })
    }
    case 'delete_sale': {
      if (role === '生産者') return NextResponse.json({ error: '権限がありません' }, { status: 403 })
      const list: any[] = await kvGet(ORG, 'sales') || []
      await kvSet(ORG, 'sales', list.filter((s: any) => s.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'clear_sales': {
      await kvSet(ORG, 'sales', [])
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
