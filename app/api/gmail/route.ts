import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../../auth/[...nextauth]/route'
import { kv } from '@vercel/kv'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Gmail クライアント生成 ─────────────────────────
function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

// ── メール本文をデコード ───────────────────────────
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

// ── Claude で売上データを解析 ─────────────────────
async function parseWithClaude(emailBody: string, products: string[]): Promise<Array<{ product: string; qty: number }>> {
  const productList = products.length > 0 ? products.join('、') : '（商品マスタ未登録）'

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `以下のメール本文から販売された商品と数量を抽出してください。

【商品マスタ】${productList}

【メール本文】
${emailBody}

JSON配列のみ返答（前置き不要）:
[{"product":"商品名","qty":数量},...]

商品マスタに近い名前があればそちらに合わせてください。数量不明は除外。`
    }]
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return []
  }
}

// ── GET: 未読メール取得 & 解析 ────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const labelId = searchParams.get('label') || 'INBOX'  // GmailラベルID
  const userId = session.user?.email || 'me'

  try {
    const gmail = getGmailClient(session.accessToken)

    // 未読メール一覧取得
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId, 'UNREAD'],
      maxResults: 20,
    })

    const messages = listRes.data.messages || []
    if (messages.length === 0) return NextResponse.json({ emails: [], parsed: [] })

    // 商品マスタをKVから取得
    const products: Array<{ name: string }> = await kv.get(`products:${userId}`) || []
    const productNames = products.map(p => p.name)

    // 各メールを解析
    const results = []
    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
      const payload = detail.data.payload
      const headers = payload?.headers || []

      const subject = headers.find(h => h.name === 'Subject')?.value || '（件名なし）'
      const from = headers.find(h => h.name === 'From')?.value || ''
      const date = headers.find(h => h.name === 'Date')?.value || ''
      const body = extractBody(payload)

      // Claude で解析
      const parsed = body ? await parseWithClaude(body, productNames) : []

      results.push({
        id: msg.id,
        subject,
        from,
        date,
        body: body.slice(0, 500),  // プレビュー用
        parsed,
      })
    }

    return NextResponse.json({ emails: results })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST: 解析結果を在庫に反映 & 既読マーク ────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user?.email || 'me'
  const body = await req.json()
  const { messageId, location, date, items } = body

  try {
    // 販売記録をKVに保存
    const key = `sales:${userId}`
    const sales: any[] = await kv.get(key) || []
    for (const item of items) {
      sales.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        date,
        location,
        product: item.product,
        qty: item.qty,
        method: 'Gmail自動解析',
        messageId,
      })
    }
    await kv.set(key, sales)

    // 既読マークをつける
    if (messageId) {
      const gmail = getGmailClient(session.accessToken)
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      })
    }

    return NextResponse.json({ ok: true, count: items.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
