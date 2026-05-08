import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'
import { kvGet, kvSet } from '@/lib/db'

function localParse(text: string): Array<{ product: string; qty: number }> {
  const results: Array<{ product: string; qty: number }> = []
  const patterns = [
    /[・\-\*]?\s*(.+?)[　\s]+(\d+)\s*個/,
    /(.+?)[：:]\s*(\d+)\s*個/,
    /(.+?)[　\s]×\s*(\d+)/,
    /(.+?)\s+(\d+)$/,
  ]
  text.split('\n').forEach(line => {
    line = line.trim()
    if (!line) return
    for (const pat of patterns) {
      const m = line.match(pat)
      if (m) {
        const product = m[1].replace(/^[・\-\*\s]+/, '').trim()
        const qty = parseInt(m[2])
        if (product.length > 0 && qty > 0) { results.push({ product, qty }); break }
      }
    }
  })
  return results
}

async function parseWithClaude(emailBody: string, products: string[]): Promise<Array<{ product: string; qty: number }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return localParse(emailBody)

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey })
  const productList = products.length > 0 ? products.join('、') : '（商品マスタ未登録）'
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: `以下のメール本文から販売された商品と数量を抽出してください。\n【商品マスタ】${productList}\n【メール本文】\n${emailBody}\nJSON配列のみ返答: [{"product":"商品名","qty":数量},...]` }]
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) } catch { return [] }
}

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

function decodeBody(raw: string): string {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) return decodeBody(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBody(part.body.data)
    }
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ''
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const labelId = searchParams.get('label') || 'INBOX'
  const userId = session.user?.email || 'me'

  try {
    const gmail = getGmailClient(session.accessToken)
    const listRes = await gmail.users.messages.list({ userId: 'me', labelIds: [labelId, 'UNREAD'], maxResults: 20 })
    const messages = listRes.data.messages || []
    if (messages.length === 0) return NextResponse.json({ emails: [] })

    const products: Array<{ name: string }> = await kv.get(`products:${userId}`) || []
    const productNames = products.map(p => p.name)

    const results = []
    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
      const payload = detail.data.payload
      const headers = payload?.headers || []
      const subject = headers.find(h => h.name === 'Subject')?.value || '（件名なし）'
      const from = headers.find(h => h.name === 'From')?.value || ''
      const date = headers.find(h => h.name === 'Date')?.value || ''
      const body = extractBody(payload)
      const parsed = body ? await parseWithClaude(body, productNames) : []
      results.push({ id: msg.id, subject, from, date, body: body.slice(0, 500), parsed })
    }
    return NextResponse.json({ emails: results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user?.email || 'me'
  const body = await req.json()
  const { messageId, location, date, items } = body

  try {
    const key = `sales:${userId}`
    const sales: any[] = await kv.get(key) || []
    for (const item of items) {
      sales.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        date, location, product: item.product, qty: item.qty, method: 'Gmail自動解析', messageId,
      })
    }
    await kv.set(key, sales)

    if (messageId) {
      const gmail = getGmailClient(session.accessToken)
      await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] } })
    }
    return NextResponse.json({ ok: true, count: items.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
