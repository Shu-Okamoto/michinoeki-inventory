// 産直/卸売 取引ワークフロー（Inc.1: データ層＋取引ライフサイクル）
// 設計: docs/SANCHOKU_WORKFLOW.md
// 取引(transaction)は 出荷→組合確認→販売者確認→成立→精算 の状態を持つ。
import { getSql, withRetry } from './db'

export type TxType = '産直' | '卸売'
export type TxStatus =
  | 'shipped'        // 出荷済（生産者が出荷数を入力）
  | 'confirmed'      // 組合確認済（納品数を確定）
  | 'sales_entered'  // 販売入力済（販売者が販売数を入力）
  | 'completed'      // 成立（販売者が確認OK）→ 精算対象
  | 'settled'        // 精算済（請求書発行済）
  | 'canceled'       // 取消

export interface Transaction {
  id: string
  type: TxType
  status: TxStatus
  date: string
  producer: string
  seller: string
  location: string
  product: string
  shipQty: number
  deliveryQty: number
  salesQty: number
  retrievedQty: number     // 生産者が引き取った数（産直の売れ残り回収）
  unitPrice: number
  commissionRate: number
  invoiceId?: string
  settledQty?: number      // 精算時に請求した数量（部分決算のスナップショット）
  carryFromId?: string     // 翌月繰越の元取引ID
  createdAt?: string
  updatedAt?: string
  // 算出値（読み取り時に付与）
  billingQty?: number
  amount?: number
  commission?: number
  producerAmount?: number
  sellerAmount?: number
}

export interface Invoice {
  id: string
  period: string          // 'YYYY-MM'
  kind: 'producer' | 'seller'
  party: string
  subtotal: number
  commission: number
  total: number
  status: string
  createdAt?: string
}

// 請求基準数量・金額の算出（お金のルールの単一の真実）
export function calcMoney(t: Pick<Transaction, 'type' | 'deliveryQty' | 'salesQty' | 'unitPrice' | 'commissionRate'>) {
  // 産直(委託)=実売数 / 卸売=組合確定の納品数
  const billingQty = t.type === '卸売' ? Number(t.deliveryQty) || 0 : Number(t.salesQty) || 0
  const amount = billingQty * (Number(t.unitPrice) || 0)
  const rate = Number(t.commissionRate) || 0
  const commission = Math.floor(amount * rate / 100)
  return {
    billingQty,
    amount,
    commission,
    producerAmount: amount,          // 生産者請求（組合宛て）= 満額
    sellerAmount: amount + commission, // 販売者請求（販売者宛て）= 満額＋手数料
  }
}

let initPromise: Promise<void> | null = null
function initTxTables(): Promise<void> {
  if (!initPromise) {
    initPromise = withRetry(async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS iwkagri_transactions (
          id TEXT PRIMARY KEY,
          org TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT '産直',
          status TEXT NOT NULL DEFAULT 'shipped',
          date TEXT NOT NULL DEFAULT '',
          producer TEXT NOT NULL DEFAULT '',
          seller TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          product TEXT NOT NULL DEFAULT '',
          ship_qty INTEGER NOT NULL DEFAULT 0,
          delivery_qty INTEGER NOT NULL DEFAULT 0,
          sales_qty INTEGER NOT NULL DEFAULT 0,
          unit_price INTEGER NOT NULL DEFAULT 0,
          commission_rate NUMERIC NOT NULL DEFAULT 0,
          invoice_id TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_tx_org_status ON iwkagri_transactions (org, status)`
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_tx_org_date ON iwkagri_transactions (org, date)`
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_tx_invoice ON iwkagri_transactions (invoice_id)`
      // 部分決算・翌月繰越のための追加カラム（既存テーブルにも後付け）
      await sql`ALTER TABLE iwkagri_transactions ADD COLUMN IF NOT EXISTS settled_qty INTEGER`
      await sql`ALTER TABLE iwkagri_transactions ADD COLUMN IF NOT EXISTS carry_from_id TEXT`
      await sql`ALTER TABLE iwkagri_transactions ADD COLUMN IF NOT EXISTS retrieved_qty INTEGER NOT NULL DEFAULT 0`
      await sql`
        CREATE TABLE IF NOT EXISTS iwkagri_invoices (
          id TEXT PRIMARY KEY,
          org TEXT NOT NULL,
          period TEXT NOT NULL,
          kind TEXT NOT NULL,
          party TEXT NOT NULL DEFAULT '',
          subtotal INTEGER NOT NULL DEFAULT 0,
          commission INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'issued',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_iwkagri_invoices_org_period ON iwkagri_invoices (org, period)`
    }).catch(err => { initPromise = null; throw err })
  }
  return initPromise
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function rowToTx(r: any): Transaction {
  const t: Transaction = {
    id: r.id,
    type: r.type,
    status: r.status,
    date: r.date,
    producer: r.producer,
    seller: r.seller,
    location: r.location,
    product: r.product,
    shipQty: Number(r.ship_qty) || 0,
    deliveryQty: Number(r.delivery_qty) || 0,
    salesQty: Number(r.sales_qty) || 0,
    retrievedQty: Number(r.retrieved_qty) || 0,
    unitPrice: Number(r.unit_price) || 0,
    commissionRate: Number(r.commission_rate) || 0,
    invoiceId: r.invoice_id ?? undefined,
    settledQty: r.settled_qty != null ? Number(r.settled_qty) : undefined,
    carryFromId: r.carry_from_id ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
  return { ...t, ...calcMoney(t) }
}

// ---- 取引 ----
export interface CreateTxInput {
  type?: TxType
  date: string
  producer: string
  seller?: string
  location?: string
  product: string
  shipQty: number
  unitPrice?: number
  commissionRate?: number
}

export async function createTransaction(org: string, input: CreateTxInput): Promise<string> {
  await initTxTables()
  const id = uid()
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      INSERT INTO iwkagri_transactions
        (id, org, type, status, date, producer, seller, location, product, ship_qty, unit_price, commission_rate)
      VALUES
        (${id}, ${org}, ${input.type || '産直'}, 'shipped', ${input.date || ''}, ${input.producer || ''},
         ${input.seller || ''}, ${input.location || ''}, ${input.product || ''}, ${Number(input.shipQty) || 0},
         ${Number(input.unitPrice) || 0}, ${Number(input.commissionRate) || 0})
    `
  })
  return id
}

// 組合: 納品数を確定・単価/手数料率を調整して confirmed へ
export async function confirmTransaction(org: string, id: string, fields: { deliveryQty: number; unitPrice?: number; commissionRate?: number; location?: string }): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      UPDATE iwkagri_transactions SET
        delivery_qty = ${Number(fields.deliveryQty) || 0},
        unit_price = COALESCE(${fields.unitPrice ?? null}, unit_price),
        commission_rate = COALESCE(${fields.commissionRate ?? null}, commission_rate),
        location = COALESCE(${fields.location ?? null}, location),
        status = 'confirmed',
        updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status IN ('shipped','confirmed')
    `
  })
}

// 販売者: 販売数（レジ通過の累積）を入力。
// 産直は完売（販売数 ≧ 納品数）で自動的に成立(completed)。卸売は sales_entered のまま。
export async function enterSales(org: string, id: string, salesQty: number): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT type, delivery_qty, retrieved_qty FROM iwkagri_transactions WHERE org = ${org} AND id = ${id}`
    if (!rows.length) return
    const type = rows[0].type
    const dq = Number(rows[0].delivery_qty) || 0
    const rq = Number(rows[0].retrieved_qty) || 0
    let q = Number(salesQty) || 0
    if (q < 0) q = 0
    // 産直は「納品数 − 引取数」を超えて販売できない（棚残を負にしない）
    const sellable = dq - rq
    if (type !== '卸売' && dq > 0 && q > sellable) q = Math.max(0, sellable)
    // 完売（実売＋引取が納品数に到達）で自動成立
    const soldOut = type !== '卸売' && dq > 0 && (q + rq) >= dq
    const newStatus = soldOut ? 'completed' : 'sales_entered'
    await sql`
      UPDATE iwkagri_transactions SET sales_qty = ${q}, status = ${newStatus}, updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status IN ('confirmed','sales_entered')
    `
  })
}

// 販売者: 確認OK → completed（成立）
export async function completeTransaction(org: string, id: string): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      UPDATE iwkagri_transactions SET status = 'completed', updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status IN ('sales_entered','confirmed')
    `
  })
}

// 生産者: 売れ残りの引き取りを記録（産直のみ）。
// 実売＋引取が納品数に達したらワークフロー完了(completed)。
export async function retrieveTransaction(org: string, id: string, retrievedQty: number): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT type, delivery_qty, sales_qty FROM iwkagri_transactions WHERE org = ${org} AND id = ${id}`
    if (!rows.length || rows[0].type === '卸売') return
    const dq = Number(rows[0].delivery_qty) || 0
    const sq = Number(rows[0].sales_qty) || 0
    let r = Number(retrievedQty) || 0
    if (r < 0) r = 0
    // 引取数は「納品数 − 実売数」を上限（累積の絶対値）
    if (dq > 0 && r > dq - sq) r = Math.max(0, dq - sq)
    const done = dq > 0 && (sq + r) >= dq
    await sql`
      UPDATE iwkagri_transactions
      SET retrieved_qty = ${r}, status = ${done ? 'completed' : 'sales_entered'}, updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status IN ('confirmed','sales_entered')
    `
  })
}

export async function cancelTransaction(org: string, id: string): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      UPDATE iwkagri_transactions SET status = 'canceled', updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status <> 'settled'
    `
  })
}

// 組合: 任意フィールドの調整（成立前）
export async function patchTransaction(org: string, id: string, f: Partial<Pick<Transaction, 'type' | 'date' | 'producer' | 'seller' | 'location' | 'product' | 'shipQty' | 'deliveryQty' | 'salesQty' | 'unitPrice' | 'commissionRate'>>): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    await sql`
      UPDATE iwkagri_transactions SET
        type = COALESCE(${f.type ?? null}, type),
        date = COALESCE(${f.date ?? null}, date),
        producer = COALESCE(${f.producer ?? null}, producer),
        seller = COALESCE(${f.seller ?? null}, seller),
        location = COALESCE(${f.location ?? null}, location),
        product = COALESCE(${f.product ?? null}, product),
        ship_qty = COALESCE(${f.shipQty ?? null}, ship_qty),
        delivery_qty = COALESCE(${f.deliveryQty ?? null}, delivery_qty),
        sales_qty = COALESCE(${f.salesQty ?? null}, sales_qty),
        unit_price = COALESCE(${f.unitPrice ?? null}, unit_price),
        commission_rate = COALESCE(${f.commissionRate ?? null}, commission_rate),
        updated_at = NOW()
      WHERE org = ${org} AND id = ${id} AND status <> 'settled'
    `
  })
}

export async function deleteTransaction(org: string, id: string): Promise<void> {
  await initTxTables()
  await withRetry(async () => {
    const sql = getSql()
    await sql`DELETE FROM iwkagri_transactions WHERE org = ${org} AND id = ${id} AND status <> 'settled'`
  })
}

export interface ListTxFilter { status?: TxStatus; period?: string; producer?: string; seller?: string }
export async function listTransactions(org: string, filter: ListTxFilter = {}): Promise<Transaction[]> {
  await initTxTables()
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`
      SELECT * FROM iwkagri_transactions
      WHERE org = ${org}
        AND (${filter.status ?? null}::text IS NULL OR status = ${filter.status ?? null})
        AND (${filter.period ?? null}::text IS NULL OR date LIKE ${(filter.period ?? '') + '%'})
        AND (${filter.producer ?? null}::text IS NULL OR producer = ${filter.producer ?? null})
        AND (${filter.seller ?? null}::text IS NULL OR seller = ${filter.seller ?? null})
      ORDER BY created_at DESC, id DESC
    `
    return rows.map(rowToTx)
  })
}

export async function getTransaction(org: string, id: string): Promise<Transaction | null> {
  await initTxTables()
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`SELECT * FROM iwkagri_transactions WHERE org = ${org} AND id = ${id}`
    return rows.length ? rowToTx(rows[0]) : null
  })
}

// 期間(YYYY-MM)の翌月1日(YYYY-MM-01)を返す
function nextMonthFirst(period: string): string {
  const [y, m] = period.split('-').map(Number)
  // m は1始まり。Date.UTC の月インデックス m は「翌月」を指す。
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

// ---- 月次精算・請求書 ----
// 指定期間(YYYY-MM)の精算対象（確認済み以降・未精算）を一括決算する。
//  - 産直: 実売数で部分決算し、売れ残り(納品数−実売数)は翌月1日付の新規取引(販売待ち)へ繰越
//  - 卸売: 納品数で全額決算（繰越なし）
// 生産者請求=満額 / 販売者請求=満額＋手数料 で集計して請求書を発行する。
export async function generateInvoices(org: string, period: string): Promise<{ producer: Invoice[]; seller: Invoice[]; count: number; carried: number }> {
  await initTxTables()
  return withRetry(async () => {
    const sql = getSql()
    const rows = await sql`
      SELECT * FROM iwkagri_transactions
      WHERE org = ${org} AND invoice_id IS NULL AND date LIKE ${period + '%'}
        AND status IN ('confirmed','sales_entered','completed')
    `
    const txs = rows.map(rowToTx)
    if (txs.length === 0) return { producer: [], seller: [], count: 0, carried: 0 }

    const carryDate = nextMonthFirst(period)
    let carried = 0
    const billed: Transaction[] = []

    for (const t of txs) {
      const isWholesale = t.type === '卸売'
      const billQty = isWholesale ? (t.deliveryQty || 0) : (t.salesQty || 0)  // 請求数量
      // 取引を精算済に（請求数量をスナップショット）
      await sql`UPDATE iwkagri_transactions
        SET status = 'settled', settled_qty = ${billQty}, invoice_id = ${period}, updated_at = NOW()
        WHERE org = ${org} AND id = ${t.id}`
      billed.push(t)
      // 産直の棚残（納品−実売−引取）は翌月へ繰越（新規取引・販売待ち）
      if (!isWholesale) {
        const remainder = (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0)
        if (remainder > 0) {
          const nid = uid()
          await sql`INSERT INTO iwkagri_transactions
            (id, org, type, status, date, producer, seller, location, product, ship_qty, delivery_qty, sales_qty, unit_price, commission_rate, carry_from_id)
            VALUES (${nid}, ${org}, ${t.type}, 'confirmed', ${carryDate}, ${t.producer}, ${t.seller}, ${t.location}, ${t.product},
                    ${remainder}, ${remainder}, 0, ${t.unitPrice}, ${t.commissionRate}, ${t.id})`
          carried++
        }
      }
    }

    // 請求数量が0のもの（その期間に1個も売れなかった産直）は請求書に計上しない
    const billable = billed.filter(t => (t.type === '卸売' ? (t.deliveryQty || 0) : (t.salesQty || 0)) > 0)

    const byProducer = new Map<string, Transaction[]>()
    const bySeller = new Map<string, Transaction[]>()
    for (const t of billable) {
      const pk = t.producer || '（未割当）'
      const sk = t.seller || '（未割当）'
      if (!byProducer.has(pk)) byProducer.set(pk, [])
      byProducer.get(pk)!.push(t)
      if (!bySeller.has(sk)) bySeller.set(sk, [])
      bySeller.get(sk)!.push(t)
    }

    const producerInvoices: Invoice[] = []
    const sellerInvoices: Invoice[] = []

    for (const [party, list] of byProducer) {
      const subtotal = list.reduce((a, t) => a + (t.producerAmount || 0), 0)
      const inv: Invoice = { id: uid(), period, kind: 'producer', party, subtotal, commission: 0, total: subtotal, status: 'issued' }
      producerInvoices.push(inv)
      await sql`INSERT INTO iwkagri_invoices (id, org, period, kind, party, subtotal, commission, total, status)
        VALUES (${inv.id}, ${org}, ${period}, 'producer', ${party}, ${subtotal}, 0, ${subtotal}, 'issued')`
    }

    for (const [party, list] of bySeller) {
      const subtotal = list.reduce((a, t) => a + (t.amount || 0), 0)
      const commission = list.reduce((a, t) => a + (t.commission || 0), 0)
      const total = subtotal + commission
      const inv: Invoice = { id: uid(), period, kind: 'seller', party, subtotal, commission, total, status: 'issued' }
      sellerInvoices.push(inv)
      await sql`INSERT INTO iwkagri_invoices (id, org, period, kind, party, subtotal, commission, total, status)
        VALUES (${inv.id}, ${org}, ${period}, 'seller', ${party}, ${subtotal}, ${commission}, ${total}, 'issued')`
    }

    return { producer: producerInvoices, seller: sellerInvoices, count: billed.length, carried }
  })
}

export async function listInvoices(org: string, period?: string): Promise<Invoice[]> {
  await initTxTables()
  return withRetry(async () => {
    const sql = getSql()
    const rows = period
      ? await sql`SELECT * FROM iwkagri_invoices WHERE org = ${org} AND period = ${period} ORDER BY kind, party`
      : await sql`SELECT * FROM iwkagri_invoices WHERE org = ${org} ORDER BY period DESC, kind, party`
    return rows.map((r: any) => ({
      id: r.id, period: r.period, kind: r.kind, party: r.party,
      subtotal: Number(r.subtotal) || 0, commission: Number(r.commission) || 0, total: Number(r.total) || 0,
      status: r.status, createdAt: r.created_at,
    }))
  })
}
