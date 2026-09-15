'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useMemo, useState } from 'react'

const thisMonth = () => new Date().toISOString().slice(0, 10).slice(0, 7)
const yen = (n: number) => '¥' + (Number(n) || 0).toLocaleString()
const r1 = (n: number) => Math.round(n * 10) / 10
const ALL = '__all__'

export default function HistoryPage() {
  const [data, setData] = useState<any>({ sales: [], products: [] })
  const [month, setMonth] = useState('')
  const [loc, setLoc] = useState(ALL)
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r => r.json()).then(setData) }

  const sales: any[] = data.sales || []
  const unitOf = (name: string): string => (data.products || []).find((p: any) => p.name === name)?.unit || '点'

  // データのある月（新しい順）。初期表示は最新の月。
  const months = useMemo(() => {
    const set = new Set<string>(sales.map(s => (s.date || '').slice(0, 7)).filter(Boolean))
    return Array.from(set).sort().reverse()
  }, [sales])

  useEffect(() => {
    if (month) return
    setMonth(months.length > 0 ? months[0] : thisMonth())
  }, [months, month])

  // 選択中の月の記録（納品先フィルタ前）
  const monthSales = useMemo(
    () => month === ALL ? sales : sales.filter(s => (s.date || '').startsWith(month)),
    [sales, month],
  )

  // 納品先の選択肢は、その月に記録がある納品先のみ
  const locations = useMemo(() => {
    const set = new Set<string>(monthSales.map(s => s.location || '').filter(Boolean))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [monthSales])

  // 選択中の納品先が今の月に無ければ「すべて」に戻す
  useEffect(() => {
    if (loc !== ALL && !locations.includes(loc)) setLoc(ALL)
  }, [locations, loc])

  const filtered = useMemo(
    () => (loc === ALL ? monthSales : monthSales.filter(s => (s.location || '') === loc))
      .slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [monthSales, loc],
  )

  // 納品先ごとの内訳（その月の全体像を見るため）
  const byLocation = useMemo(() => {
    const map = new Map<string, { location: string; count: number; qty: number; amount: number }>()
    for (const s of monthSales) {
      const k = s.location || '—'
      if (!map.has(k)) map.set(k, { location: k, count: 0, qty: 0, amount: 0 })
      const hit = map.get(k)!
      hit.count += 1
      hit.qty += Number(s.qty) || 0
      hit.amount += Number(s.amount) || 0
    }
    return Array.from(map.values())
      .map(x => ({ ...x, qty: r1(x.qty) }))
      .sort((a, b) => b.amount - a.amount)
  }, [monthSales])

  const totalQty = r1(filtered.reduce((a, s) => a + (Number(s.qty) || 0), 0))
  const totalAmount = filtered.reduce((a, s) => a + (Number(s.amount) || 0), 0)

  async function deleteSale(id: string) {
    if (!confirm('この売上記録を削除しますか？')) return
    await fetch('/api/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_sale', payload: { id } }),
    })
    refresh()
    setToast('🗑 削除しました')
    setTimeout(() => setToast(''), 2500)
  }

  const s = {
    select: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' } as any,
    label: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5 },
    th: { padding: '12px 16px', textAlign: 'left' as any, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as any, color: 'var(--muted)' },
    td: { padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13 },
    tdr: { padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 13, textAlign: 'right' as any, fontFamily: 'Space Mono,monospace' },
    delBtn: { background: '#FBE0DE', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 150 } as any,
  }

  const periodLabel = month === ALL ? '全期間' : month

  return (
    <AppShell>
      {/* 絞り込み */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label style={s.label}>月</label>
          <select style={s.select} value={month} onChange={e => setMonth(e.target.value)}>
            {months.length === 0 && <option value={thisMonth()}>{thisMonth()}</option>}
            {months.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={ALL}>全期間</option>
          </select>
        </div>
        <div>
          <label style={s.label}>納品先</label>
          <select style={{ ...s.select, minWidth: 180 }} value={loc} onChange={e => setLoc(e.target.value)}>
            <option value={ALL}>すべての納品先</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* サマリー */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>件数（{periodLabel}）</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Mono,monospace' }}>{filtered.length} 件</div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>レジ通過数 合計</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--accent2)' }}>{totalQty.toLocaleString()}</div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>売上金額 合計</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--accent)' }}>{yen(totalAmount)}</div>
        </div>
      </div>

      {/* 納品先ごとの内訳（納品先を絞っていないときだけ） */}
      {loc === ALL && byLocation.length > 1 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto', marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700 }}>
            🏪 納品先ごとの内訳（{periodLabel}）
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>
              <th style={s.th}>納品先</th>
              <th style={{ ...s.th, textAlign: 'right' }}>件数</th>
              <th style={{ ...s.th, textAlign: 'right' }}>レジ通過数</th>
              <th style={{ ...s.th, textAlign: 'right' }}>売上金額</th>
              <th style={{ ...s.th, width: 60 }}></th>
            </tr></thead>
            <tbody>
              {byLocation.map(b => (
                <tr key={b.location}>
                  <td style={{ ...s.td, color: 'var(--accent2)', fontWeight: 600 }}>{b.location}</td>
                  <td style={s.tdr}>{b.count}</td>
                  <td style={s.tdr}>{b.qty.toLocaleString()}</td>
                  <td style={{ ...s.tdr, fontWeight: 700, color: 'var(--accent)' }}>{yen(b.amount)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button
                      onClick={() => setLoc(b.location)}
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}
                    >絞込</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 明細 */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--surface2)' }}>
            {['日付', '生産者', '納品先', '商品', 'レジ通過数', '単価', '金額', '入力方法', ''].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((s2: any) => (
              <tr key={s2.id}>
                <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', fontSize: 11, color: 'var(--muted)' }}>{s2.date}</td>
                <td style={s.td}>{s2.producer || '—'}</td>
                <td style={{ ...s.td, color: 'var(--accent2)' }}>{s2.location}</td>
                <td style={s.td}>{s2.product}</td>
                <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', color: 'var(--accent)' }}>{s2.qty}{unitOf(s2.product)}</td>
                <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', color: 'var(--muted)' }}>{Number(s2.unitPrice) > 0 ? yen(s2.unitPrice) : '—'}</td>
                <td style={{ ...s.td, fontFamily: 'Space Mono,monospace', color: 'var(--text)' }}>{Number(s2.amount) > 0 ? yen(s2.amount) : '—'}</td>
                <td style={s.td}><span style={{ background: 'var(--surface2)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{s2.method || '手動'}</span></td>
                <td style={s.td}><button style={s.delBtn} onClick={() => deleteSale(s2.id)}>削除</button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                {sales.length === 0 ? '記録がありません' : `${periodLabel}${loc === ALL ? '' : `・${loc}`} の記録はありません`}
              </td></tr>
            )}
          </tbody>
        </table>
        {filtered.length > 300 && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
            新しい順に300件まで表示しています（該当 {filtered.length} 件）。月や納品先で絞り込んでください。
          </div>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
