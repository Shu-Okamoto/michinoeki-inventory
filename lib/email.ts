// Resend互換のREST APIでメール送信（追加依存なし）。
// RESEND_API_KEY が未設定なら送信せず skipped を返す。
// 別サービス（Bento等）を使う場合はこの関数だけ差し替えればよい。

export interface SendResult { ok: boolean; skipped?: boolean; error?: string }

export async function sendMail(opts: { to: string; from: string; subject: string; text: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, skipped: true, error: 'RESEND_API_KEY 未設定' }
  if (!opts.to) return { ok: false, error: '宛先なし' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, text: opts.text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send failed' }
  }
}

// テンプレート展開: {date} {producer} {company} {items} {total} {count}
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

export const DEFAULT_SALES_TEMPLATE =
  `{producer} 様

いつもお世話になっております。いわくにアグリパートナーズです。
{date} の産直品レジ通過（売上）数をお知らせします。

{items}

合計: {total} 点

ご確認のほどよろしくお願いいたします。`
