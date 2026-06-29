'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useMemo, useState } from 'react'

const thisMonth = () => new Date().toISOString().slice(0, 7)

type Tab = 'daily' | 'producer'

export default function ShipmentAnalysisPage() {
  const [me, setMe] = useState<any>({})
  const [myTxList, setMyTxList] = useState<any[]>([])   // 自分の取引（商品セレクト用）
  const [allTxList, setAllTxList] = useState<any[]>([]) // 商品指定時の全生産者分
  const [month, setMonth] = useState(thisMonth())
  const [product, setProduct] = useState('')
  const [tab, setTab] = useState<Tab>('daily')

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => setMe(d.me || {}))
    fetch('/api/transactions').then(r => r.json()).then(d => setMyTxList(d.transactions || []))
  }, [])

  // 商品選択時に同商品の全生産者分を取得
  useEffect(() => {
    if (!product) { setAllTxList([]); return }
    fetch(`/api/transactions?product=${encodeURIComponent(product)}`)
      .then(r => r.json()).then(d => setAllTxList(d.transactions || []))
  }, [product])

  const role = me?.role || ''
  const isAdmin = role === 'admin'
  const isPartner = role === '組合パートナー' || role === '組合管理者'
  const isProducer = role === '生産者'

  // 自分の成立取引のみ（商品セレクト・月リスト用）
  const myCompleted = useMemo(() => myTxList.filter(t => t.status === 'completed'), [myTxList])

  // 自分が出荷している商品のみ（生産者ロールは自分名義、admin/partnerは全件）
  const myProducts = useMemo(() => {
    const base = (isAdmin || isPartner)
      ? myCompleted
      : myCompleted.filter(t => t.producer === me?.name)
    const set = new Set(base.map(t => t.product).filter(Boolean))
    return Array.from(set).sort()
  }, [myCompleted, isAdmin, isPartner, me?.name])

  // 月リスト
  const months = useMemo(() => {
    const set = new Set<string>(myCompleted.map(t => (t.date || '').slice(0, 7)).filter(Boolean))
    const arr = Array.from(set).sort().reverse()
    if (!arr.includes(thisMonth())) arr.unshift(thisMonth())
    return arr
  }, [myCompleted])

  // 表示データ：商品選択時は全生産者分、未選択時は自分の取引のみ
  const baseTx = product ? allTxList.filter(t => t.status === 'completed') : myCompleted
  const filtered = useMemo(() => {
    return baseTx.filter(t =>
      (t.date || '').startsWith(month) && (!product || t.product === product)
    )
  }, [baseTx, month, product])

  function txQty(t: any): number {
    const raw = t.type === '卸売'
      ? (t.gradeAQty || 0) + (t.gradeBQty || 0)
      : (t.salesQty || 0) + (t.discountQty || 0) + (t.souzaiQty || 0)
    return Math.round(raw * 10) / 10
  }

  // 日別リスト（日付・生産者・商品名・数量）
  const dailyRows = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(t => ({ date: t.date, producer: t.producer || '—', product: t.product || '—', qty: txQty(t) }))
  }, [filtered])

  // 生産者別・商品ごとの集計
  const producerRows = useMemo(() => {
    // producer → product → qty
    const map = new Map<string, Map<string, number>>()
    filtered.forEach(t => {
      const p = t.producer || '—'
      const pr = t.product || '—'
      if (!map.has(p)) map.set(p, new Map())
      const inner = map.get(p)!
      inner.set(pr, (inner.get(pr) || 0) + txQty(t))
    })
    return Array.from(map.entries())
      .map(([producer, products]) => {
        const items = Array.from(products.entries()).map(([product, qty]) => ({ product, qty })).sort((a, b) => b.qty - a.qty)
        const total = items.reduce((s, i) => s + i.qty, 0)
        return { producer, items, total }
      })
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  const totalQty = filtered.reduce((a, t) => a + txQty(t), 0)
  const maxBar = producerRows.length > 0 ? Math.max(...producerRows.map(r => r.total)) : 1

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 } as React.CSSProperties,
    th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', borderBottom: '1px solid var(--border)' },
    td: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 },
    select: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none' },
    tab: (active: boolean): React.CSSProperties => ({
      padding: '7px 16px', fontSize: 13, fontWeight: active ? 700 : 400, cursor: 'pointer', border: 'none',
      borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      background: 'transparent', color: active ? 'var(--accent)' : 'var(--muted)',
    }),
  }

  return (
    <AppShell>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>📊 出荷分析 <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>（成立した取引のみ）</span></h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={s.select}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={product} onChange={e => setProduct(e.target.value)} style={{ ...s.select, minWidth: 160 }}>
            <option value="">すべての商品</option>
            {myProducts.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* サマリー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: '総出荷数', value: totalQty.toLocaleString(), color: 'var(--accent)' },
          { label: '成立取引数', value: `${filtered.length} 件`, color: 'var(--accent2)' },
          { label: '生産者数', value: `${producerRows.length} 名`, color: 'var(--warn)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* タブ */}
      <div style={s.box}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <button style={s.tab(tab === 'daily')} onClick={() => setTab('daily')}>📅 日別</button>
          <button style={s.tab(tab === 'producer')} onClick={() => setTab('producer')}>👤 生産者別</button>
        </div>

        {/* 日別：日付・生産者・数量リスト */}
        {tab === 'daily' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={s.th}>日付</th>
                <th style={s.th}>生産者</th>
                <th style={s.th}>商品名</th>
                <th style={{ ...s.th, textAlign: 'right' as const }}>数量</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length === 0
                ? <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>データがありません</td></tr>
                : dailyRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{r.producer}</td>
                    <td style={s.td}>{r.product}</td>
                    <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', color: 'var(--accent)', fontWeight: 700, textAlign: 'right' as const }}>{r.qty}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* 生産者別：商品ごとの棒グラフ */}
        {tab === 'producer' && (
          <div style={{ padding: 20 }}>
            {producerRows.length === 0
              ? <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 32 }}>データがありません</div>
              : producerRows.map(r => (
                <div key={r.producer} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.producer}</span>
                    <span style={{ fontFamily: 'Space Mono,monospace', color: 'var(--muted)', fontSize: 12 }}>合計 {r.total.toLocaleString()}</span>
                  </div>
                  {r.items.map((item: { product: string; qty: number }) => (
                    <div key={item.product} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--muted)' }}>{item.product}</span>
                        <span style={{ fontFamily: 'Space Mono,monospace', color: 'var(--accent)', fontWeight: 700 }}>{item.qty}</span>
                      </div>
                      <div style={{ background: 'var(--surface2)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${(item.qty / maxBar) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
