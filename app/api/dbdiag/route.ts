import { NextResponse } from 'next/server'
import postgres from 'postgres'

// 詳細DB診断。各操作を短いstatement_timeoutで実行し、どこで詰まる/遅いかを特定する。
// 504(HTML)ではなく必ずJSONで返す。利用後は削除可。
export const maxDuration = 25

export async function GET() {
  const url = process.env.POSTGRES_URL
  if (!url) return NextResponse.json({ error: 'POSTGRES_URL not set' })
  // 専用の診断接続（8秒で打ち切り）
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5, connection: { statement_timeout: '8000' } })

  const steps: any[] = []
  async function step(name: string, fn: () => Promise<any>) {
    const t0 = Date.now()
    try { const r = await fn(); steps.push({ name, ms: Date.now() - t0, ok: true, result: r }) }
    catch (e: any) { steps.push({ name, ms: Date.now() - t0, ok: false, error: String(e?.message || e), code: e?.code || null }) }
  }

  await step('select1', async () => (await sql`SELECT 1 as ok`)[0])
  await step('count_kv', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_kv_store`)[0].n)
  await step('count_transactions', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_transactions`)[0].n)
  await step('count_invoices', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_invoices`)[0].n)
  await step('count_shipments', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_shipments`)[0].n)
  await step('count_sales', async () => (await sql`SELECT count(*)::int AS n FROM iwkagri_sales`)[0].n)
  // 長時間動いている/ブロックされているセッション
  await step('long_running', async () => await sql`
    SELECT pid, state, wait_event_type, wait_event,
           extract(epoch from (now()-query_start))::int AS dur_s, left(query, 90) AS q
    FROM pg_stat_activity
    WHERE state IS NOT NULL AND state <> 'idle' AND query_start < now() - interval '3 seconds'
    ORDER BY query_start LIMIT 10`)
  // ロック待ち
  await step('lock_waits', async () => await sql`
    SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`)

  try { await sql.end({ timeout: 3 }) } catch {}
  return NextResponse.json({ steps })
}
