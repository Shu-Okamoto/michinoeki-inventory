'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'
import styles from './dashboard.module.css'

interface InventoryRow {
  location: string; product: string; shipped: number; sold: number
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [filterLoc, setFilterLoc] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const res = await fetch('/api/inventory')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  function getInventory(): InventoryRow[] {
    if (!data) return []
    const map: Record<string, InventoryRow> = {}
    data.shipments.forEach((s: any) => {
      const k = `${s.location}|${s.product}`
      if (!map[k]) map[k] = { location: s.location, product: s.product, shipped: 0, sold: 0 }
      map[k].shipped += Number(s.qty)
    })
    data.sales.forEach((s: any) => {
      const k = `${s.location}|${s.product}`
      if (!map[k]) map[k] = { location: s.location, product: s.product, shipped: 0, sold: 0 }
      map[k].sold += Number(s.qty)
    })
    let rows = Object.values(map)
    if (filterLoc) rows = rows.filter(r => r.location === filterLoc)
    return rows.sort((a, b) => (a.product + a.location).localeCompare(b.product + b.location))
  }

  const rows = getInventory()
  const todayStr = new Date().toISOString().slice(0, 10)
  const todaySold = data?.sales?.filter((s: any) => s.date === todayStr).reduce((a: number, b: any) => a + Number(b.qty), 0) || 0
  const totalStock = rows.reduce((a, b) => a + Math.max(0, b.shipped - b.sold), 0)
  const lowCount = rows.filter(r => { const s = r.shipped - r.sold; return s > 0 && s <= 5 }).length
  const emptyCount = rows.filter(r => r.shipped - r.sold <= 0).length

  return (
    <AppShell>
      <div className={styles.summaryGrid}>
        <SummaryCard color="green" label="総在庫（全店舗）" value={totalStock} sub="個" />
        <SummaryCard color="blue" label="本日の販売数" value={todaySold} sub="個（解析済み）" />
        <SummaryCard color="orange" label="残りわずか" value={lowCount} sub="種類（5個以下）" />
        <SummaryCard color="red" label="在庫切れ" value={emptyCount} sub="種類" />
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>現在の在庫状況</h2>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <select className={styles.select} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
            <option value="">すべての道の駅</option>
            {data?.locations?.map((l: string) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className={styles.btnSm} onClick={fetchData}>🔄 更新</button>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className={styles.spinner} /></div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}><div style={{fontSize:32,marginBottom:12}}>📦</div>出荷登録をしてください</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>
              <th>商品名</th><th>道の駅</th><th>出荷数</th><th>販売済</th><th>在庫</th><th>状態</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const current = r.shipped - r.sold
                const pct = r.shipped > 0 ? Math.max(0, Math.min(100, (current / r.shipped) * 100)) : 0
                const color = current <= 0 ? 'var(--danger)' : current <= 5 ? 'var(--warn)' : 'var(--accent)'
                const badge = current <= 0 ? ['badge-empty','在庫切れ'] : current <= 5 ? ['badge-low','残りわずか'] : ['badge-ok','在庫あり']
                return (
                  <tr key={i}>
                    <td><strong>{r.product}</strong></td>
                    <td style={{color:'var(--accent2)'}}>{r.location}</td>
                    <td style={{fontFamily:'Space Mono,monospace'}}>{r.shipped}</td>
                    <td style={{fontFamily:'Space Mono,monospace'}}>{r.sold}</td>
                    <td>
                      <div className={styles.barWrap}>
                        <div className={styles.bar}><div className={styles.barFill} style={{width:`${pct}%`,background:color}} /></div>
                        <span style={{fontFamily:'Space Mono,monospace',fontSize:12,color,minWidth:48,textAlign:'right'}}>{Math.max(0,current)}個</span>
                      </div>
                    </td>
                    <td><span className={`${styles.badge} ${styles[badge[0]]}`}>{badge[1]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}

function SummaryCard({ color, label, value, sub }: { color:string; label:string; value:number; sub:string }) {
  return (
    <div className={`${styles.card} ${styles['card-'+color]}`}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={`${styles.cardValue} ${styles['val-'+color]}`}>{value}</div>
      <div className={styles.cardSub}>{sub}</div>
    </div>
  )
}
