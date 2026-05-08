import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/db'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user?.email!

  const [locations, products, shipments, sales, gmailSettings] = await Promise.all([
    kvGet(userId, 'locations'),
    kvGet(userId, 'products'),
    kvGet(userId, 'shipments'),
    kvGet(userId, 'sales'),
    kvGet(userId, 'gmail_settings'),
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
      const list: string[] = await kvGet(userId, 'locations') || []
      if (!list.includes(payload.name)) list.push(payload.name)
      await kvSet(userId, 'locations', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_location': {
      const list: string[] = await kvGet(userId, 'locations') || []
      await kvSet(userId, 'locations', list.filter((l: string) => l !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_product': {
      const list: any[] = await kvGet(userId, 'products') || []
      if (!list.find((p: any) => p.name === payload.name)) list.push({ name: payload.name, aliases: payload.aliases || '' })
      await kvSet(userId, 'products', list)
      return NextResponse.json({ ok: true })
    }
    case 'remove_product': {
      const list: any[] = await kvGet(userId, 'products') || []
      await kvSet(userId, 'products', list.filter((p: any) => p.name !== payload.name))
      return NextResponse.json({ ok: true })
    }
    case 'add_shipment': {
      const list: any[] = await kvGet(userId, 'shipments') || []
      list.push({ id: uid(), ...payload })
      await kvSet(userId, 'shipments', list)
      return NextResponse.json({ ok: true })
    }
    case 'delete_shipment': {
      const list: any[] = await kvGet(userId, 'shipments') || []
      await kvSet(userId, 'shipments', list.filter((s: any) => s.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'add_sales': {
      const list: any[] = await kvGet(userId, 'sales') || []
      for (const item of payload.items) {
        list.push({ id: uid(), date: payload.date, location: payload.location, method: payload.method || '手動', ...item })
      }
      await kvSet(userId, 'sales', list)
      return NextResponse.json({ ok: true })
    }
    case 'save_gmail_settings': {
      await kvSet(userId, 'gmail_settings', payload)
      return NextResponse.json({ ok: true })
    }
    case 'delete_sale': {
      const list: any[] = await kvGet(userId, 'sales') || []
      await kvSet(userId, 'sales', list.filter((s: any) => s.id !== payload.id))
      return NextResponse.json({ ok: true })
    }
    case 'clear_sales': {
      await kvSet(userId, 'sales', [])
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
