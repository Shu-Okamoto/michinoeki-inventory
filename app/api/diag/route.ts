import { NextResponse } from 'next/server'
import postgres from 'postgres'

// 実行リージョンとDB往復遅延の確認用。常にJSONで返す（504回避）。利用後は削除可。
export const maxDuration = 25

export async function GET() {
  const region = process.env.VERCEL_REGION || '(unknown)'
  const url = process.env.POSTGRES_URL || ''
  const host = url.match(/@([^/:]+)/)?.[1] || '(unknown)'
  if (!url) return NextResponse.json({ region, error: 'POSTGRES_URL not set' })
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5, connection: { statement_timeout: 8000 } })

  const steps: any[] = []
  async function step(name: string, fn: () => Promise<any>) {
    const t0 = Date.now()
    try { const r = await fn(); steps.push({ name, ms: Date.now() - t0, ok: true, result: r }) }
    catch (e: any) { steps.push({ name, ms: Date.now() - t0, ok: false, error: String(e?.message || e) }) }
  }
  await step('connect+select1', async () => (await sql`SELECT 1 AS ok`)[0])
  await step('warm_select2', async () => (await sql`SELECT 1 AS ok`)[0]) // 温まった後の純粋な往復
  await step('warm_select3', async () => (await sql`SELECT 1 AS ok`)[0])
  await step('count_kv', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_kv_store`)[0].n)
  await step('count_tx', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_transactions`)[0].n)

  try { await sql.end({ timeout: 3 }) } catch {}
  return NextResponse.json({ region, host, steps })
}
