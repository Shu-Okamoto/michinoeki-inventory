import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db'

// DB接続の疎通確認用。障害時はログイン自体ができない（ログイン処理がDBを読むため）ので、
// 認証不要で参照できるようにしている。認証情報が漏れないよう、エラーメッセージは
// 接続文字列・ホスト・ユーザー名などを伏せた上で返す。
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// 接続文字列やホスト名・IPを伏せる
function sanitize(msg: string): string {
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s]*/gi, 'postgres://***')
    .replace(/\/\/[^@\s/]*@/g, '//***@')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '***')
    .replace(/\b[\w.-]+\.(?:neon\.tech|supabase\.co|amazonaws\.com|vercel-storage\.com)\b/gi, '***')
    .slice(0, 300)
}

export async function GET() {
  const started = Date.now()
  const hasUrl = !!process.env.POSTGRES_URL

  if (!hasUrl) {
    return NextResponse.json(
      { ok: false, hasPostgresUrl: false, stage: 'env', error: 'POSTGRES_URL が設定されていません' },
      { status: 503 },
    )
  }

  try {
    const sql = getSql()
    const rows = await sql`SELECT 1 AS ok`
    const elapsedMs = Date.now() - started
    // スキーマ移行の状態も返す（テーブル未作成でもエラーにしない）
    let schemaVersion: number | null = null
    try {
      const v = await sql`SELECT version FROM iwkagri_schema_version WHERE id = 1`
      schemaVersion = v.length ? Number(v[0].version) : null
    } catch { /* 未作成なら null のまま */ }

    return NextResponse.json({
      ok: rows.length === 1,
      hasPostgresUrl: true,
      elapsedMs,
      schemaVersion,
      checkedAt: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        hasPostgresUrl: true,
        stage: 'connect',
        elapsedMs: Date.now() - started,
        code: e?.code || e?.errno || null,
        error: sanitize(String(e?.message || e)),
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    )
  }
}
