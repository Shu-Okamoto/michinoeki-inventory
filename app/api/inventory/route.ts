import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { kv } from '@vercel/kv'
import { authOptions } from '@/lib/auth'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user?.email!

  const [locations, products, shipments, sales, gmailSettings] = await Promise.all([
    kv.get(`locations:${userId}`),
    kv.get(`products:${userId}`),
    kv.get(`shipments:${userId}`),
    kv.get(`sales:${userId}`),
    kv.get(`gmail_settings:${userId}`),
  ])

  return NextResponse.json({
    locations: locations || [],
    products: products || [],
    shipments: shipments || [],
    sales: sales || [],
    gmailSettings: gmailSettings || { labelId: '', labelName: '', autoFetch: false },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user?.email!

  const body = await req.json()
  const { action, payload } = body

  switch (action) {
    case 'add_location': {
      const list: string[] = await kv.get(`locations:${userId}`) || []
      if (!list.includes(payload.name)) list.push(payload.name)
      await kv.set(`locations:${userId}`, list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_location': {
      const list: string[] = await kv.get(`locations:${userId}`) || []
      await kv.set(`locations:${userId}`, list.filter(l => l !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_product': {
      const list: any[] = await kv.get(`products:${userId}`) || []
      if (!list.find(p => p.name === payload.name)) list.push({ name: payload.name, aliases: payload.aliases || '' })
      await kv.set(`products:${userId}`, list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_product': {
      const list: any[] = await kv.get(`products:${userId}`) || []
      await kv.set(`products:${userId}`, list.filter(p => p.name !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_shipment': {
      const list: any[] = await kv.get(`shipments:${userId}`) || []
      list.push({ id: uid(), ...payload })
      await kv.set(`shipments:${userId}`, list)
      return NextResponse.json({ ok: true })
    }
    case 'delete_shipment': {
      const list: any[] = await kv.get(`shipments:${userId}`) || []
      await kv.set(`shipments:${userId}`, list.filter(s => s.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      const list: any[] = await kv.get(`sales:${userId}`) || []
      for (const item of payload.items) {
        list.push({ id: uid(), date: payload.date, location: payload.location, method: payload.method || '手動', ...item })
      }
      await kv.set(`sales:${userId}`, list)
      return NextResponse.json({ ok: true })
    }
    case 'save_gmail_settings': {
      await kv.set(`gmail_settings:${userId}`, payload)
      return NextResponse.json({ ok: true })
    }
    case 'clear_sales': {
      await kv.set(`sales:${userId}`, [])
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
