import { kvGet, kvSet } from './db'
import { listSalesByDate } from './records'
import { ORG, MasterUser } from './users'
import { sendMail, renderTemplate, DEFAULT_SALES_TEMPLATE, SendResult } from './email'

export function jstToday(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().slice(0, 10)
}

export function jstHHMM(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().slice(11, 16)
}

interface SalesSettings {
  enabled?: boolean
  fromEmail?: string
  sendTime?: string      // "17:00"
  subject?: string
  template?: string
  lastSalesMailDate?: string
}

// 指定日（JST）のレジ通過数を生産者ごとに集計してメール送信する
export async function sendSalesDigest(dateStr?: string): Promise<{ date: string; sent: number; skipped: number; errors: string[]; results: { producer: string; to: string; result: SendResult }[] }> {
  const date = dateStr || jstToday()
  const [todays, producers, settingsRaw] = await Promise.all([
    listSalesByDate(ORG, date),
    kvGet<MasterUser[]>(ORG, 'producers'),
    kvGet<any>(ORG, 'settings'),
  ])
  const settings: SalesSettings = (settingsRaw?.salesMail) || {}
  const from = settings.fromEmail || 'onboarding@resend.dev'
  const subjectTpl = settings.subject || '【いわくにアグリパートナーズ】{date} の産直品売上数のお知らせ'
  const template = settings.template || DEFAULT_SALES_TEMPLATE

  // 生産者名でグルーピング
  const byProducer: Record<string, any[]> = {}
  for (const s of todays) {
    const key = s.producer || '（未割当）'
    ;(byProducer[key] = byProducer[key] || []).push(s)
  }

  const results: { producer: string; to: string; result: SendResult }[] = []
  let sent = 0, skipped = 0
  const errors: string[] = []

  for (const [producerName, items] of Object.entries(byProducer)) {
    const master = (producers || []).find(p => p.name === producerName)
    const to = master?.email || ''
    if (!to) { skipped++; results.push({ producer: producerName, to: '', result: { ok: false, skipped: true, error: 'メール未登録' } }); continue }

    const hasPrice = items.some(i => Number(i.unitPrice || 0) > 0)
    const lines = items.map(i => {
      const amt = Number(i.amount || 0)
      return hasPrice
        ? `・${i.product}　${i.qty} 点　¥${amt.toLocaleString()}`
        : `・${i.product}　${i.qty} 点`
    }).join('\n')
    const total = items.reduce((a, b) => a + Number(b.qty || 0), 0)
    const totalAmount = items.reduce((a, b) => a + Number(b.amount || 0), 0)
    const rate = Number(settingsRaw?.commissionRate) || 0
    const commission = Math.floor(totalAmount * rate / 100)
    const net = totalAmount - commission
    const vars = {
      date, producer: producerName, company: master?.company || '', items: lines, total, count: items.length,
      amount: totalAmount.toLocaleString(), commission: commission.toLocaleString(), net: net.toLocaleString(), rate,
    }
    const body = renderTemplate(template, vars)
    const subject = renderTemplate(subjectTpl, vars)

    const result = await sendMail({ to, from, subject, text: body })
    results.push({ producer: producerName, to, result })
    if (result.ok) sent++; else { skipped++; if (result.error) errors.push(`${producerName}: ${result.error}`) }
  }

  // 二重送信防止のため最終送信日を記録
  await kvSet(ORG, 'settings', { ...(settingsRaw || {}), salesMail: { ...settings, lastSalesMailDate: date } })

  return { date, sent, skipped, errors, results }
}

// Cron用: 設定時刻を過ぎていて、当日まだ送信していなければ送信
export async function maybeSendScheduled(): Promise<{ ran: boolean; reason?: string; summary?: any }> {
  const settingsRaw = await kvGet<any>(ORG, 'settings')
  const settings: SalesSettings = (settingsRaw?.salesMail) || {}
  if (!settings.enabled) return { ran: false, reason: 'disabled' }
  const today = jstToday()
  if (settings.lastSalesMailDate === today) return { ran: false, reason: 'already-sent-today' }
  const sendTime = settings.sendTime || '17:00'
  if (jstHHMM() < sendTime) return { ran: false, reason: 'before-send-time' }
  const summary = await sendSalesDigest(today)
  return { ran: true, summary }
}
