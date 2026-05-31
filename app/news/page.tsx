'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

interface Announcement { id: string; date: string; title: string; body: string; pinned: boolean }
const today = () => new Date().toISOString().slice(0, 10)

export default function NewsPage() {
  const [list, setList] = useState<Announcement[]>([])
  const [form, setForm] = useState({ date: today(), title: '', body: '', pinned: false })
  const [composing, setComposing] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r => r.json()).then(d => setList(d.announcements || [])) }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    refresh()
  }

  async function post() {
    if (!form.title) { showToast('⚠️ タイトルを入力してください'); return }
    await api('add_announcement', form)
    setForm({ date: today(), title: '', body: '', pinned: false }); setComposing(false)
    showToast('✅ お知らせを掲載しました')
  }

  const sorted = [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.date.localeCompare(a.date))

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 } as any,
    boxHead: { padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    boxBody: { padding: 20 },
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', display: 'block', marginBottom: 6 },
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' },
    btn: { background: 'var(--accent)', color: '#0f1117', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    btnGhost: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' },
    delBtn: { background: '#450a0a', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>📢 お知らせ・情報共有</h2>
        <button style={s.btnGhost} onClick={() => setComposing(!composing)}>{composing ? '× 閉じる' : '＋ 新規投稿'}</button>
      </div>

      {composing && (
        <div style={s.box}>
          <div style={s.boxHead}>新しいお知らせ</div>
          <div style={s.boxBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={s.label}>日付</label><input type="date" style={s.input} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><label style={s.label}>タイトル *</label><input style={s.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例: 共配スケジュール変更のお知らせ" /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>本文</label>
              <textarea style={{ ...s.input, minHeight: 100, resize: 'vertical' }} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="組合員へ共有する内容を入力" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /> 📌 上部に固定する
            </label>
            <button style={s.btn} onClick={post}>掲載する</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ ...s.box, padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>まだお知らせはありません</div>
      ) : sorted.map(a => (
        <div key={a.id} style={s.box}>
          <div style={s.boxHead}>
            <span>{a.pinned && '📌 '}{a.title}</span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{a.date}</span>
              <button style={s.delBtn} onClick={() => { if (confirm('このお知らせを削除しますか？')) api('remove_announcement', { id: a.id }) }}>削除</button>
            </span>
          </div>
          {a.body && <div style={{ ...s.boxBody, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.body}</div>}
        </div>
      ))}
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
