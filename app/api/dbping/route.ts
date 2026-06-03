import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

// DB接続の診断用。SELECT 1 を1回だけ実行し、成否・所要時間・エラー内容を
// JSONで返す（504のHTMLではなく必ず読めるJSONにするためエラーでも200）。
export const maxDuration = 25

export async function GET() {
  const t0 = Date.now()
  const url = process.env.POSTGRES_URL || ''
  // 接続先の概要だけ（パスワードは出さない）
  const host = (url.match(/@([^/:]+)/)?.[1]) || '(unknown)'
  const port = (url.match(/:(\d+)\//)?.[1]) || '(unknown)'
  const usesPooler = /pooler\.supabase\.com/.test(url)
  try {
    const sql = getSql()
    const r = await sql`SELECT 1 as ok`
    return NextResponse.json({ ok: true, ms: Date.now() - t0, host, port, usesPooler, result: r[0] })
  } catch (e: any) {
    return NextResponse.json({
      ok: false, ms: Date.now() - t0, host, port, usesPooler,
      error: String(e?.message || e), code: e?.code || null,
    })
  }
}
