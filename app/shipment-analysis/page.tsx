'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useMemo, useState } from 'react'

const thisMonth = () => new Date().toISOString().slice(0, 7)

type Tab = 'daily' | 'product' | 'location' | 'producer'

export default function ShipmentAnalysisPage() {
  const [me, setMe] = useState<any>({})
  const [txList, setTxList] = useState<any[]>([])
  const [month, setMonth] = useState(thisMonth())
  const [tab, setTab] = useState<Tab>('daily')

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => setMe(d.me || {}))
    fetch('/api/transactions').then(r => r.json()).then(d => setTxList(d.transactions || []))
  }, [])

  const role = me?.role || ''
  const isAdmin = role === 'admin'
  const isPartner = role === '組合パートナー' || role === '組合管理者'

  // 成立した取引のみ、月でフィルター（生産者ロールも全件表示）
  const filtered = useMemo(() => {
    return txList.filter(t => t.status === 'completed' && (t.date || '').startsWith(month))
  }, [txList, month])

  // 月リストを生成（成立取引のある月のみ）
  const months = useMemo(() => {
    const set = new Set<string>(
      txList.filter(t => t.status === 'completed').map(t => (t.date || '').slice(0, 7)).filter(Boolean)
    )
    const arr = Array.from(set).sort().reverse()
    if (!arr.includes(thisMonth())) arr.unshift(thisMonth())
    return arr
  }, [txList])

  // 取引ごとの出荷数（卸売: gradeAQty+gradeBQty、産直: salesQty+discountQty+souzaiQty）
  function txQty(t: any): number {
    if (t.type === '卸売') return (t.gradeAQty || 0) + (t.gradeBQty || 0)
    return (t.salesQty || 0) + (t.discountQty || 0) + (t.souzaiQty || 0)
  }

  function txAmount(t: any): number {
    return t.producerAmount ?? t.sellerAmount ?? 0
  }

  // 日別集計
  const dailyRows = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(t => {
      const d = t.date || ''
      map.set(d, (map.get(d) || 0) + txQty(t))
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, qty]) => ({ date, qty }))
  }, [filtered])

  // 商品別集計
  const productRows = useMemo(() => {
    const map = new Map<string, { qty: number; amount: number }>()
    filtered.forEach(t => {
      const p = t.product || '—'
      const prev = map.get(p) || { qty: 0, amount: 0 }
      map.set(p, { qty: prev.qty + txQty(t), amount: prev.amount + txAmount(t) })
    })
    return Array.from(map.entries()).sort((a, b) => b[1].qty - a[1].qty)
      .map(([product, v]) => ({ product, ...v }))
  }, [filtered])

  // 納品先別集計
  const locationRows = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(t => {
      const l = t.seller || t.location || '—'
      map.set(l, (map.get(l) || 0) + txQty(t))
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      .map(([location, qty]) => ({ location, qty }))
  }, [filtered])

  // 生産者別集計
  const producerRows = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(t => {
      const p = t.producer || '—'
      map.set(p, (map.get(p) || 0) + txQty(t))
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
      .map(([producer, qty]) => ({ producer, qty }))
  }, [filtered])

  const totalQty = filtered.reduce((a, t) => a + txQty(t), 0)
  const totalAmount = filtered.reduce((a, t) => a + txAmount(t), 0)
  const yen = (n: number) => '¥' + (n || 0).toLocaleString()

  const maxBar = (rows: { qty: number }[]) => Math.max(...rows.map(r => r.qty), 1)

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 } as React.CSSProperties,
    th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', borderBottom: '1px solid var(--border)' },
    td: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '7px 16px', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', border: 'none',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      background: 'transparent', color: active ? 'var(--accent)' : 'var(--muted)',
    }),
  }

  function Bar({ qty, max }: { qty: number; max: number }) {
    const pct = max > 0 ? (qty / max) * 100 : 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 12, color: 'var(--accent)', minWidth: 40, textAlign: 'right' }}>{qty}</span>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'daily', label: '📅 日別' },
    { key: 'product', label: '🌱 商品別' },
    { key: 'location', label: '🏪 販売先別' },
    ...((isAdmin || isPartner) ? [{ key: 'producer' as Tab, label: '👤 生産者別' }] : []),
  ]

  return (
    <AppShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>📊 出荷分析 <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>（成立した取引のみ）</span></h2>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
        >
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: '総出荷数', value: `${totalQty.toLocaleString()}`, color: 'var(--accent)' },
          { label: '成立取引数', value: `${filtered.length} 件`, color: 'var(--accent2)' },
          { label: '商品種類', value: `${productRows.length} 種`, color: 'var(--warn)' },
          ...(totalAmount > 0 ? [{ label: '金額合計', value: yen(totalAmount), color: 'var(--accent)' }] : []),
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* タブ切り替え */}
      <div style={s.box}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          {tabs.map(t => (
            <button key={t.key} style={s.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* 日別 */}
        {tab === 'daily' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={s.th}>日付</th>
                <th style={{ ...s.th, width: '60%' }}>出荷数</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length === 0
                ? <tr><td colSpan={2} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>データがありません</td></tr>
                : dailyRows.map(r => (
                  <tr key={r.date}>
                    <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={s.td}><Bar qty={r.qty} max={maxBar(dailyRows)} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 商品別 */}
        {tab === 'product' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={s.th}>商品名</th>
                <th style={{ ...s.th, width: '45%' }}>出荷数</th>
                {totalAmount > 0 && <th style={{ ...s.th, textAlign: 'right' as const }}>金額</th>}
              </tr>
            </thead>
            <tbody>
              {productRows.length === 0
                ? <tr><td colSpan={3} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>データがありません</td></tr>
                : productRows.map(r => (
                  <tr key={r.product}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.product}</td>
                    <td style={s.td}><Bar qty={r.qty} max={maxBar(productRows)} /></td>
                    {totalAmount > 0 && <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', fontSize: 12, color: 'var(--muted)', textAlign: 'right' as const }}>{r.amount > 0 ? yen(r.amount) : '—'}</td>}
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 販売先別 */}
        {tab === 'location' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={s.th}>販売先</th>
                <th style={{ ...s.th, width: '60%' }}>出荷数</th>
              </tr>
            </thead>
            <tbody>
              {locationRows.length === 0
                ? <tr><td colSpan={2} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>データがありません</td></tr>
                : locationRows.map(r => (
                  <tr key={r.location}>
                    <td style={{ ...s.td, color: 'var(--accent2)', fontWeight: 600 }}>{r.location}</td>
                    <td style={s.td}><Bar qty={r.qty} max={maxBar(locationRows)} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 生産者別（admin・partner のみ） */}
        {tab === 'producer' && (isAdmin || isPartner) && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={s.th}>生産者</th>
                <th style={{ ...s.th, width: '60%' }}>出荷数</th>
              </tr>
            </thead>
            <tbody>
              {producerRows.length === 0
                ? <tr><td colSpan={2} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>データがありません</td></tr>
                : producerRows.map(r => (
                  <tr key={r.producer}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.producer}</td>
                    <td style={s.td}><Bar qty={r.qty} max={maxBar(producerRows)} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
