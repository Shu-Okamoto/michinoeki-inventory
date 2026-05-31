'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

interface Producer { id: string; name: string; email: string; phone: string; note: string }

export default function ProducersPage() {
  const [list, setList] = useState<Producer[]>([])
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' })
  const [editing, setEditing] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r => r.json()).then(d => setList(d.producers || [])) }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    refresh()
  }

  async function save() {
    if (!form.name) { showToast('⚠️ 組合員名を入力してください'); return }
    if (editing) {
      await api('update_producer', { id: editing, ...form })
      showToast('✅ 更新しました')
    } else {
      await api('add_producer', form)
      showToast('✅ 組合員を登録しました')
    }
    setForm({ name: '', email: '', phone: '', note: '' }); setEditing(null)
  }

  function startEdit(p: Producer) {
    setEditing(p.id); setForm({ name: p.name, email: p.email, phone: p.phone, note: p.note })
  }

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 } as any,
    boxHead: { padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 },
    boxBody: { padding: 20 },
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', display: 'block', marginBottom: 6 },
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' },
    btn: { background: 'var(--accent)', color: '#0f1117', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    btnGhost: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' },
    th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)' },
    td: { padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 13 },
    delBtn: { background: '#450a0a', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
    editBtn: { background: 'var(--surface2)', color: 'var(--accent2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', marginRight: 6 },
  }

  return (
    <AppShell>
      <div style={s.box}>
        <div style={s.boxHead}>{editing ? '✏️ 組合員を編集' : '👤 組合員（生産者）を登録'}</div>
        <div style={s.boxBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
            <div><label style={s.label}>組合員名 *</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例: 山田 太郎" /></div>
            <div><label style={s.label}>メール</label><input style={s.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="farmer@example.com" /></div>
            <div><label style={s.label}>電話</label><input style={s.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="090-..." /></div>
            <div><label style={s.label}>備考</label><input style={s.input} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="生産品目など" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={s.btn} onClick={save}>{editing ? '💾 更新する' : '＋ 登録する'}</button>
            {editing && <button style={s.btnGhost} onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', note: '' }) }}>キャンセル</button>}
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--surface2)' }}>
            {['組合員名', 'メール', '電話', '備考', ''].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td style={{ ...s.td, fontWeight: 600 }}>{p.name}</td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.email || '—'}</td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.phone || '—'}</td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.note || '—'}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <button style={s.editBtn} onClick={() => startEdit(p)}>編集</button>
                  <button style={s.delBtn} onClick={() => { if (confirm(`「${p.name}」を削除しますか？`)) api('remove_producer', { id: p.id }) }}>削除</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>まだ組合員が登録されていません</td></tr>}
          </tbody>
        </table>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
