import { neon, NeonQueryFunction } from '@neondatabase/serverless'

// 接続はモジュール読み込み時ではなく初回利用時に初期化する
// （ビルド時に環境変数が無くても import で落ちないようにするため）
let _sql: NeonQueryFunction<false, false> | null = null
function getSql() {
  if (!_sql) {
    const url = process.env.POSTGRES_URL
    if (!url) throw new Error('POSTGRES_URL is not set')
    _sql = neon(url)
  }
  return _sql
}

// テーブルを初期化（初回のみ実行）
export async function initDB() {
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, key)
    )
  `
}

// KVのget相当
export async function kvGet<T>(userId: string, key: string): Promise<T | null> {
  await initDB()
  const sql = getSql()
  const rows = await sql`
    SELECT value FROM kv_store WHERE user_id = ${userId} AND key = ${key}
  `
  if (rows.length === 0) return null
  return rows[0].value as T
}

// KVのset相当
export async function kvSet(userId: string, key: string, value: any): Promise<void> {
  await initDB()
  const sql = getSql()
  await sql`
    INSERT INTO kv_store (user_id, key, value, updated_at)
    VALUES (${userId}, ${key}, ${JSON.stringify(value)}, NOW())
    ON CONFLICT (user_id, key)
    DO UPDATE SET value = ${JSON.stringify(value)}, updated_at = NOW()
  `
}
