'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

// 生産者（・組合）が自分の商品マスタ・道の駅マスタを登録するページ
export default function MasterPage() {
  const [data, setData] = useState<any>({ products: [], locations: [], me: {} })
  const [toast, setToast] = useState('')
  // 商品申請
  const [pName, setPName] = useState(''); const [pUnit, setPUnit] = useState(''); const [pPrice, setPPrice] = useState('')
  // 道の駅
  const [lName, setLName] = useState('')
  const [editingLoc, setEditingLoc] = useState<string | null>(null)
  const [editLocName, setEditLocName] = useState('')

  function refresh() { fetch('/api/inventory').then(r => r.json()).then(setData) }
  useEffect(() => { refresh() }, [])
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2800) }

  async function api(action: string, payload: any) {
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('⚠️ ' + (j.error || '失敗しました')); return j }
    refresh(); return j
  }

  const me = data.me?.name || ''
  // 商品・道の駅は登録した本人のものだけ（共通マスタは持たない）
  const myProducts = (data.products || []).filter((p: any) => p.producer === me || p.proposedBy === me)
  const myLocations = (data.locations || []).filter((l: any) => (l.producer || '') === me)

  async function proposeProduct() {
    if (!pName) { showToast('⚠️ 商品名を入力してください'); return }
    const j = await api('propose_product', { name: pName, unit: pUnit, unitPrice: Number(pPrice) || 0 })
    if (j?.ok) { setPName(''); setPUnit(''); setPPrice(''); showToast(j.status === 'approved' ? '✅ 商品を登録しました' : '✅ 商品を申請しました（組合の承認待ち）') }
  }
  async function addLocation() {
    if (!lName) { showToast('⚠️ 道の駅名を入力してください'); return }
    const j = await api('add_location', { name: lName })
    if (j?.ok) { setLName(''); showToast('✅ 道の駅を登録しました') }
  }
  function startEditLocation(l: any) { setEditingLoc(l.id || l.name); setEditLocName(l.name) }
  async function saveLocation(l: any) {
    const name = editLocName.trim()
    if (!name) { showToast('⚠️ 道の駅名を入力してください'); return }
    if (name === l.name) { setEditingLoc(null); return }
    if (!confirm(`「${l.name}」を「${name}」に変更します。\n過去の納品・売上・取引の納品先名もあわせて変更されます。\nよろしいですか？`)) return
    const j = await api('update_location', { id: l.id, oldName: l.name, name })
    if (j?.ok) {
      setEditingLoc(null)
      const u = j.updated
      showToast(`✅ 道の駅名を変更しました${u ? `（過去データ ${(u.shipments || 0) + (u.sales || 0) + (u.transactions || 0)} 件も更新）` : ''}`)
    }
  }
  async function removeLocation(l: any) {
    if (!confirm(`「${l.name}」を削除します。\n過去の納品・売上の記録は残りますが、今後の納品先として選べなくなります。\nよろしいですか？`)) return
    const j = await api('remove_location', { id: l.id, name: l.name })
    if (j?.ok) showToast('🗑️ 道の駅を削除しました')
  }

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 } as any,
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' } as any,
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as any,
    chip: { fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', display: 'inline-flex', gap: 6, alignItems: 'center' } as any,
    del: { border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 13 } as any,
    btnGhost: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' } as any,
    btnDanger: { background: '#FBE0DE', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' } as any,
  }

  return (
    <AppShell>
      {/* 商品マスタ */}
      <div style={s.box}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🌱 商品マスタ（自分の商品を申請）</h2>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>申請した商品は組合管理者の承認で使えるようになります（承認まで納品・取引の選択には出ません）。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input style={{ ...s.input, maxWidth: 220 }} value={pName} onChange={e => setPName(e.target.value)} placeholder="商品名（例: 白瓜）" />
          <input style={{ ...s.input, maxWidth: 130 }} list="unit-list" value={pUnit} onChange={e => setPUnit(e.target.value)} placeholder="単位（袋/本/KG）" />
          <input style={{ ...s.input, maxWidth: 130 }} type="number" min="0" value={pPrice} onChange={e => setPPrice(e.target.value)} placeholder="希望単価(円)" />
          <button style={s.btn} onClick={proposeProduct}>申請する</button>
          <datalist id="unit-list"><option value="袋" /><option value="本" /><option value="個" /><option value="KG" /><option value="束" /><option value="パック" /><option value="箱" /></datalist>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {myProducts.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>まだ登録がありません</p>}
          {myProducts.map((p: any) => {
            const pending = (p.status || 'approved') === 'pending'
            return (
              <div key={p.id || p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unit ? `${p.unit}・` : ''}{p.unitPrice ? `¥${Number(p.unitPrice).toLocaleString()}` : ''}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: pending ? '#FCEFCF' : '#DCEFD2', color: pending ? '#9A6B00' : '#2E6B17' }}>{pending ? '承認待ち' : '承認済'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 道の駅マスタ */}
      <div style={s.box}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🏪 道の駅マスタ（自分の納品先）</h2>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>自分が納品する道の駅を登録します。ここで登録した道の駅は自分専用で、他の組合員には表示されません。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <input style={{ ...s.input, maxWidth: 280 }} value={lName} onChange={e => setLName(e.target.value)} placeholder="道の駅名（例: 道の駅 ○○）" />
          <button style={s.btn} onClick={addLocation}>登録する</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {myLocations.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>まだ登録がありません</p>}
          {myLocations.map((l: any) => {
            const editing = editingLoc === (l.id || l.name)
            return (
              <div key={l.id || l.name} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {editing ? (
                  <>
                    <input
                      style={{ ...s.input, maxWidth: 280 }}
                      value={editLocName}
                      onChange={e => setEditLocName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveLocation(l) }}
                      autoFocus
                    />
                    <button style={s.btn} onClick={() => saveLocation(l)}>保存</button>
                    <button style={s.btnGhost} onClick={() => setEditingLoc(null)}>キャンセル</button>
                  </>
                ) : (
                  <>
                    <span style={{ ...s.chip, fontSize: 13 }}>🏪 {l.name}</span>
                    <button style={s.btnGhost} onClick={() => startEditLocation(l)}>✏️ 名称変更</button>
                    <button style={s.btnDanger} onClick={() => removeLocation(l)}>🗑️ 削除</button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--text)', boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
