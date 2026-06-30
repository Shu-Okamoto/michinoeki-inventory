'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

interface Producer { id: string; name: string; role: string; disabled?: boolean; company: string; email: string; phone: string; note: string; loginId?: string; hasLogin?: boolean; address?: string; bankName?: string; bankBranch?: string; bankAccountType?: string; bankAccountNumber?: string; bankAccountHolder?: string }
const ROLES = ['生産者', '販売者', '組合パートナー']
const emptyForm = { name: '', role: '生産者', company: '', email: '', phone: '', note: '', loginId: '', password: '', address: '', bankName: '', bankBranch: '', bankAccountType: '普通', bankAccountNumber: '', bankAccountHolder: '' }

export default function ProducersPage() {
  const [list, setList] = useState<Producer[]>([])
  const [form, setForm] = useState({ ...emptyForm })
  const [editing, setEditing] = useState<string | null>(null)
  const [filterRole, setFilterRole] = useState('')
  const [filterDisabled, setFilterDisabled] = useState<boolean | null>(false)
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r => r.json()).then(d => setList(d.producers || [])) }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    refresh()
  }

  async function save() {
    if (!form.name) { showToast('⚠️ 氏名・名称を入力してください'); return }
    if (editing) {
      await api('update_producer', { id: editing, ...form })
      showToast('✅ 更新しました')
    } else {
      await api('add_producer', form)
      showToast('✅ ユーザーを登録しました')
    }
    setForm({ ...emptyForm }); setEditing(null)
  }

  function startEdit(p: Producer) {
    setEditing(p.id); setForm({
      name: p.name, role: p.role || '生産者', company: p.company || '', email: p.email, phone: p.phone, note: p.note, loginId: p.loginId || '', password: '',
      address: p.address || '', bankName: p.bankName || '', bankBranch: p.bankBranch || '', bankAccountType: p.bankAccountType || '普通', bankAccountNumber: p.bankAccountNumber || '', bankAccountHolder: p.bankAccountHolder || '',
    })
  }

  async function toggleDisabled(p: Producer) {
    await api('update_producer', { id: p.id, disabled: !p.disabled })
    showToast(p.disabled ? '✅ 有効化しました' : '⏸ 休止にしました')
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
    delBtn: { background: '#FBE0DE', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
    pauseBtn: { background: '#FFF8E1', color: '#B8860B', border: '1px solid #B8860B', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', marginRight: 6 },
    resumeBtn: { background: '#E8F5E9', color: '#2E7D32', border: '1px solid #2E7D32', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', marginRight: 6 },
    editBtn: { background: 'var(--surface2)', color: 'var(--accent2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', marginRight: 6 },
    filterOn: { background: 'var(--accent)', color: '#0f1117', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    filterOff: { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' },
    filterWarn: { background: '#B8860B', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  }

  const filtered = list.filter(p => {
    if (filterRole && (p.role || '生産者') !== filterRole) return false
    if (filterDisabled === false && p.disabled) return false
    if (filterDisabled === true && !p.disabled) return false
    return true
  })

  return (
    <AppShell>
      <div style={s.box}>
        <div style={s.boxHead}>{editing ? '✏️ ユーザーを編集' : '👤 ユーザー（生産者・販売者・組合パートナー）を登録'}</div>
        <div style={s.boxBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
            <div><label style={s.label}>氏名・名称 *</label><input style={s.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例: 山田 太郎 / 道の駅みかわ" /></div>
            <div><label style={s.label}>区分</label><select style={s.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
            <div><label style={s.label}>所属会社・販売先</label><input style={s.input} value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="例: みかわ" /></div>
            <div><label style={s.label}>メール</label><input style={s.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" /></div>
            <div><label style={s.label}>電話</label><input style={s.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="090-..." /></div>
            <div><label style={s.label}>備考</label><input style={s.input} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="生産品目など" /></div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 16px', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>🏦 住所・振込先情報（請求書発行・支払管理用）</div>
            <div style={{ marginBottom: 12 }}><label style={s.label}>住所</label><input style={s.input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="例: 山口県岩国市〇〇1-2-3" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
              <div><label style={s.label}>金融機関名</label><input style={s.input} value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="例: 山口銀行" /></div>
              <div><label style={s.label}>支店名</label><input style={s.input} value={form.bankBranch} onChange={e => setForm({ ...form, bankBranch: e.target.value })} placeholder="例: 岩国支店" /></div>
              <div><label style={s.label}>口座種別</label>
                <select style={s.input} value={form.bankAccountType} onChange={e => setForm({ ...form, bankAccountType: e.target.value })}>
                  <option value="普通">普通</option>
                  <option value="当座">当座</option>
                </select>
              </div>
              <div><label style={s.label}>口座番号</label><input style={s.input} value={form.bankAccountNumber} onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })} placeholder="例: 1234567" /></div>
              <div><label style={s.label}>口座名義（カナ）</label><input style={s.input} value={form.bankAccountHolder} onChange={e => setForm({ ...form, bankAccountHolder: e.target.value })} placeholder="例: ヤマダ タロウ" /></div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 16px', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>🔑 ログイン情報（ID/パスワード認証）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              <div><label style={s.label}>ログインID</label><input style={s.input} value={form.loginId} onChange={e => setForm({ ...form, loginId: e.target.value })} placeholder="例: yamada" autoComplete="off" /></div>
              <div><label style={s.label}>パスワード{editing && '（変更時のみ）'}</label><input type="password" style={s.input} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? '変更する場合のみ入力' : '初期パスワード'} autoComplete="new-password" /></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={s.btn} onClick={save}>{editing ? '💾 更新する' : '＋ 登録する'}</button>
            {editing && <button style={s.btnGhost} onClick={() => { setEditing(null); setForm({ ...emptyForm }) }}>キャンセル</button>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={filterRole === '' && filterDisabled === false ? s.filterOn : s.filterOff} onClick={() => { setFilterRole(''); setFilterDisabled(false) }}>有効ユーザー</button>
        {ROLES.map(r => <button key={r} style={filterRole === r && filterDisabled === false ? s.filterOn : s.filterOff} onClick={() => { setFilterRole(r); setFilterDisabled(false) }}>{r}</button>)}
        <button style={filterDisabled === true ? s.filterWarn : s.filterOff} onClick={() => { setFilterRole(''); setFilterDisabled(true) }}>⏸ 休止中</button>
        <button style={filterDisabled === null ? s.filterOff : s.filterOff} onClick={() => { setFilterRole(''); setFilterDisabled(null) }}>すべて</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: 'var(--surface2)' }}>
            {['氏名・名称', '状態', '区分', '所属・販売先', 'ログイン', '振込先', 'メール', '電話', ''].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.map(p => {
              const role = p.role || '生産者'
              const rc = role === '生産者' ? 'var(--accent)' : role === '販売者' ? 'var(--accent2)' : role === 'admin' ? '#e55' : 'var(--warn)'
              return (
              <tr key={p.id} style={p.disabled ? { opacity: 0.5 } : undefined}>
                <td style={{ ...s.td, fontWeight: 600 }}>{p.name}</td>
                <td style={s.td}>
                  {p.disabled
                    ? <span style={{ background: '#FFF8E1', color: '#B8860B', border: '1px solid #B8860B', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>休止</span>
                    : <span style={{ background: '#E8F5E9', color: '#2E7D32', border: '1px solid #2E7D32', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>有効</span>
                  }
                </td>
                <td style={s.td}><span style={{ background: 'var(--surface2)', color: rc, border: `1px solid ${rc}`, padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{role}</span></td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.company || '—'}</td>
                <td style={s.td}>{p.hasLogin
                  ? <span style={{ color: 'var(--accent)' }}>✓ {p.loginId}</span>
                  : <span style={{ color: 'var(--muted)' }}>未設定</span>}</td>
                <td style={s.td}>{p.bankAccountNumber
                  ? <span style={{ color: 'var(--accent)' }}>✓ {p.bankName}{p.bankBranch}</span>
                  : <span style={{ color: 'var(--muted)' }}>未登録</span>}</td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.email || '—'}</td>
                <td style={{ ...s.td, color: 'var(--muted)' }}>{p.phone || '—'}</td>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                  <button style={s.editBtn} onClick={() => startEdit(p)}>編集</button>
                  <button style={p.disabled ? s.resumeBtn : s.pauseBtn} onClick={() => toggleDisabled(p)}>
                    {p.disabled ? '▶ 有効化' : '⏸ 休止'}
                  </button>
                  <button style={s.delBtn} onClick={() => { if (confirm(`「${p.name}」を削除しますか？`)) api('remove_producer', { id: p.id }) }}>削除</button>
                </td>
              </tr>
            )})}
            {filtered.length === 0 && <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 32 }}>該当するユーザーがいません</td></tr>}
          </tbody>
        </table>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
