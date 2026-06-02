// 売上(sales)・出荷(shipments)はトランザクション系で件数が無限に増えるため、
// KV(JSONB配列まるごと)ではなく1行=1レコードの専用テーブルに保存する。
// これにより「全件読み→push→全件書き戻し」によるロストアップデートと、
// 配列肥大化による読み書きコストの悪化を解消する。
import { getSql, withRetry, kvGet, kvSet } from './db'

export interface SaleRecord {
  id: string
  date: string
  location: string
  producer: string
  product: string
  qty: number
  method: string
  messageId?: string
}

export interface ShipmentRecord {
  id: string
  date?: string
  location: string
  producer: string
  product: string
  qty: number
}

// テーブル/インデックス初期化はプロセス内で1回だけ
let initPromise: Promise<void> | null = null
function initRecordTables(): Promise<void> {
  if (!initPromise) {
    initPromise = withRetry(async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS iwkagri_sales (
          id TEXT PRIMARY KEY,
          org TEXT NOT NULL,
          date TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          producer TEXT NOT NULL DEFAULT '',
          product TEXT NOT NULL DEFAULT '',
          qty INTEGER NOT NULL DEFAULT 0,
          method TEXT NOT NULL DEFAULT '手動',
          message_id TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_sales_org_date ON iwkagri_sales (org, date)`
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_sales_org_producer ON iwkagri_sales (org, producer)`
      await sql`
        CREATE TABLE IF NOT EXISTS iwkagri_shipments (
          id TEXT PRIMARY KEY,
          org TEXT NOT NULL,
          date TEXT,
          location TEXT NOT NULL DEFAULT '',
          producer TEXT NOT NULL DEFAULT '',
          product TEXT NOT NULL DEFAULT '',
          qty INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_shipments_org ON iwkagri_shipments (org)`
    }).catch(err => { initPromise = null; throw err })
  }
  return initPromise
}

// ---- 内部insert（移行と通常追加で共用。ensureMigratedを呼ばないことで再帰を避ける） ----
// ON CONFLICT DO NOTHING で冪等にし、移行が途中で失敗・再実行されても重複挿入で壊れないようにする。
async function rawInsertSales(org: string, recs: SaleRecord[]): Promise<void> {
  if (!recs.length) return
  const rows = recs.map(r => ({
    id: r.id, org, date: r.date || '', location: r.location || '', producer: r.producer || '',
    product: r.product || '', qty: Number(r.qty) || 0, method: r.method || '手動', message_id: r.messageId ?? null,
  }))
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      INSERT INTO iwkagri_sales ${sql(rows, 'id', 'org', 'date', 'location', 'producer', 'product', 'qty', 'method', 'message_id')}
      ON CONFLICT (id) DO NOTHING
    `
  })
}

async function rawInsertShipment(org: string, rec: ShipmentRecord): Promise<void> {
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      INSERT INTO iwkagri_shipments (id, org, date, location, producer, product, qty)
      VALUES (${rec.id}, ${org}, ${rec.date ?? null}, ${rec.location || ''}, ${rec.producer || ''}, ${rec.product || ''}, ${Number(rec.qty) || 0})
      ON CONFLICT (id) DO NOTHING
    `
  })
}

// 旧KV(配列)に売上/出荷が残っている場合、テーブルへ一度だけ移し替える。
// 新規Supabaseでは空なので実質no-op。Neon運用中でも無停止で移行できる。
const migratedOrgs = new Set<string>()
async function ensureMigrated(org: string): Promise<void> {
  if (migratedOrgs.has(org)) return
  await initRecordTables()
  if (!(await kvGet(org, '_records_migrated'))) {
    const oldSales = await kvGet<any[]>(org, 'sales')
    if (Array.isArray(oldSales) && oldSales.length) {
      await rawInsertSales(org, oldSales.map(s => ({
        id: s.id, date: s.date || '', location: s.location || '', producer: s.producer || '',
        product: s.product || '', qty: Number(s.qty) || 0, method: s.method || '手動', messageId: s.messageId,
      })))
    }
    const oldShip = await kvGet<any[]>(org, 'shipments')
    if (Array.isArray(oldShip) && oldShip.length) {
      for (const s of oldShip) {
        await rawInsertShipment(org, { id: s.id, date: s.date, location: s.location || '', producer: s.producer || '', product: s.product || '', qty: Number(s.qty) || 0 })
      }
    }
    await kvSet(org, '_records_migrated', true)
  }
  migratedOrgs.add(org)
}

function rowToSale(r: any): SaleRecord {
  const rec: SaleRecord = { id: r.id, date: r.date, location: r.location, producer: r.producer, product: r.product, qty: Number(r.qty), method: r.method }
  if (r.message_id != null) rec.messageId = r.message_id
  return rec
}

// ---- sales 公開API ----
export async function listSales(org: string): Promise<SaleRecord[]> {
  await ensureMigrated(org)
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT * FROM iwkagri_sales WHERE org = ${org} ORDER BY created_at ASC, id ASC`
    return rows.map(rowToSale)
  })
}

export async function listSalesByDate(org: string, date: string): Promise<SaleRecord[]> {
  await ensureMigrated(org)
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT * FROM iwkagri_sales WHERE org = ${org} AND date = ${date} ORDER BY created_at ASC, id ASC`
    return rows.map(rowToSale)
  })
}

export async function addSales(org: string, recs: SaleRecord[]): Promise<void> {
  await ensureMigrated(org)
  await rawInsertSales(org, recs)
}

export async function deleteSale(org: string, id: string): Promise<void> {
  await ensureMigrated(org)
  await withRetry(async () => {
    const sql = getSql()
    await sql`DELETE FROM iwkagri_sales WHERE org = ${org} AND id = ${id}`
  })
}

export async function clearSales(org: string): Promise<void> {
  await ensureMigrated(org)
  await withRetry(async () => {
    const sql = getSql()
    await sql`DELETE FROM iwkagri_sales WHERE org = ${org}`
  })
}

// ---- shipments 公開API ----
export async function listShipments(org: string): Promise<ShipmentRecord[]> {
  await ensureMigrated(org)
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT * FROM iwkagri_shipments WHERE org = ${org} ORDER BY created_at ASC, id ASC`
    return rows.map((r: any) => ({ id: r.id, date: r.date ?? undefined, location: r.location, producer: r.producer, product: r.product, qty: Number(r.qty) }))
  })
}

export async function addShipment(org: string, rec: ShipmentRecord): Promise<void> {
  await ensureMigrated(org)
  await rawInsertShipment(org, rec)
}

export async function deleteShipment(org: string, id: string): Promise<void> {
  await ensureMigrated(org)
  await withRetry(async () => {
    const sql = getSql()
    await sql`DELETE FROM iwkagri_shipments WHERE org = ${org} AND id = ${id}`
  })
}
