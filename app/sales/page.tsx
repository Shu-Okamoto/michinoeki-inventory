'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

const today = () => new Date().toISOString().slice(0, 10)

export default function SalesPage() {
  const [data, setData] = useState<any>({ locations: [], products: [], sales: [], producers: [] })
  const [loc, setLoc] = useState('')
  const [producer, setProducer] = useState('')
  const [date, setDate] = useState(today())
  const [entries, setEntries] = useState<Array<{ product: string; qty: string }>>([
    { product: '', qty: '' }
  ])
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetch('/api/inventory').then(r => r.json()).then(setData) }, [])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  function addRow() {
    setEntries(prev => [...prev, { product: '', qty: '' }])
  }

  function removeRow(i: number) {
    setEntries(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateEntry(i: number, field: 'product' | 'qty', val: string) {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  async function submit() {
    if (!producer) { showToast('⚠️ 生産者を選択してください'); return }
    if (!loc) { showToast('⚠️ 販売先を選択してください'); return }
    const items = entries.filter(e => e.product && e.qty && Number(e.qty) > 0)
    if (items.length === 0) { showToast('⚠️ 商品とレジ通過数を入力してください'); return }

    setLoading(true)
    await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_sales',
        payload: {
          date, location: loc, producer, method: '手入力',
          items: items.map(e => ({ product: e.product, qty: Number(e.qty) }))
        }
      })
    })
    setLoading(false)
    setEntries([{ product: '', qty: '' }])
    showToast(`✅ ${producer} のレジ通過数を${items.length}件登録しました`)
    fetch('/api/inventory').then(r => r.json()).then(setData)
  }

  // 選択した生産者が納品した商品のみを抽出
  const producerProducts: string[] = producer
    ? Array.from(new Set((data.shipments || []).filter((x: any) => x.producer === producer).map((x: any) => x.product)))
    : []

  // 商品マスタの単価
  const priceOf = (name: string): number => Number((data.products || []).find((p: any) => p.name === name)?.unitPrice) || 0
  const yen = (n: number) => '¥' + (n || 0).toLocaleString()

  // 今日の売上サマリー
  const todaySales = data.sales?.filter((s: any) => s.date === today()) || []
  const entriesTotal = entries.reduce((a, e) => a + (e.product && e.qty ? priceOf(e.product) * Number(e.qty) : 0), 0)

  const s = {
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', display: 'block', marginBottom: 6 },
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%' },
    select: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%' },
  }

  return (
    <AppShell>
      {/* 入力フォーム */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 700 }}>
          🧾 レジ通過数入力（産直品）
        </div>
        <div style={{ padding: 20 }}>
          {/* 生産者・販売先・日付 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={s.label}>生産者（送信先）</label>
              <select style={s.select} value={producer} onChange={e => { setProducer(e.target.value); setEntries([{ product: '', qty: '' }]) }}>
                <option value="">選択してください</option>
                {(data.producers || []).filter((p: any) => (p.role || '生産者') === '生産者').map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>販売先（道の駅）</label>
              <select style={s.select} value={loc} onChange={e => setLoc(e.target.value)}>
                <option value="">選択してください</option>
                {data.locations?.map((l: any) => <option key={l.id || l} value={l.name || l}>{l.name || l}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>日付</label>
              <input type="date" style={s.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* 商品行 */}
          {!producer ? (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>まず生産者を選択してください。</p>
          ) : producerProducts.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--warn)', marginBottom: 12 }}>⚠️ この生産者の納品実績がありません。先に「みかわ納品数入力」で納品を登録してください。</p>
          ) : (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 36px', gap: 8, marginBottom: 8 }}>
              <span style={{ ...s.label, marginBottom: 0 }}>商品名（{producer} の納品商品）</span>
              <span style={{ ...s.label, marginBottom: 0 }}>レジ通過数</span>
              <span style={{ ...s.label, marginBottom: 0 }}>金額</span>
              <span />
            </div>
            {entries.map((entry, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <select style={s.select} value={entry.product} onChange={e => updateEntry(i, 'product', e.target.value)}>
                  <option value="">商品を選択</option>
                  {producerProducts.map((name: string) => <option key={name} value={name}>{name}{priceOf(name) > 0 ? `（${yen(priceOf(name))}）` : ''}</option>)}
                </select>
                <input
                  type="number" min="1" placeholder="個数"
                  style={{ ...s.input, textAlign: 'center' }}
                  value={entry.qty}
                  onChange={e => updateEntry(i, 'qty', e.target.value)}
                />
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 13, color: 'var(--accent)', textAlign: 'right' }}>
                  {entry.product && entry.qty ? yen(priceOf(entry.product) * Number(entry.qty)) : '—'}
                </span>
                <button
                  onClick={() => removeRow(i)}
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 16, cursor: 'pointer' }}
                >×</button>
              </div>
            ))}
            {entriesTotal > 0 && (
              <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                合計金額: <span style={{ fontFamily: 'Space Mono, monospace', color: 'var(--accent)', fontWeight: 700 }}>{yen(entriesTotal)}</span>
              </div>
            )}
          </div>
          )}

          {/* ボタン */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={addRow} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
              ＋ 商品を追加
            </button>
            <button
              onClick={submit}
              disabled={loading}
              style={{ background: 'var(--accent)', color: '#0f1117', border: 'none', borderRadius: 8, padding: '9px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? .6 : 1 }}
            >
              {loading ? '登録中...' : '✅ レジ通過数を登録する'}
            </button>
          </div>
        </div>
      </div>

      {/* 本日の売上 */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📊 本日のレジ通過記録</span>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--accent)' }}>{todaySales.length}件</span>
        </div>
        {todaySales.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>まだ記録がありません</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['販売先', '商品', 'レジ通過数', '金額'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todaySales.map((s2: any) => (
                <tr key={s2.id}>
                  <td style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', color: 'var(--accent2)' }}>{s2.location}</td>
                  <td style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>{s2.product}</td>
                  <td style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontFamily: 'Space Mono, monospace', color: 'var(--accent)', fontWeight: 700 }}>{s2.qty}個</td>
                  <td style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontFamily: 'Space Mono, monospace', color: 'var(--muted)' }}>{Number(s2.amount) > 0 ? yen(s2.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>
          {toast}
        </div>
      )}
    </AppShell>
  )
}
