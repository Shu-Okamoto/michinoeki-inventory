'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

interface Reply { id: string; author: string; role: string; body: string; date: string }
interface Announcement { id: string; date: string; title: string; body: string; pinned: boolean; replies?: Reply[] }
const today = () => new Date().toISOString().slice(0, 10)

export default function NewsPage() {
  const [list, setList] = useState<Announcement[]>([])
  const [me, setMe] = useState<{ role: string; name: string }>({ role: '', name: '' })
  const [form, setForm] = useState({ date: today(), title: '', body: '', pinned: false })
  const [composing, setComposing] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() {
    fetch('/api/inventory').then(r => r.json()).then(d => {
      setList(d.announcements || [])
      setMe({ role: d.me?.role || '', name: d.me?.name || '' })
    })
  }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    refresh()
  }

  const isAdmin = me.role === '組合管理者'

  async function post() {
    if (!form.title) { showToast('⚠️ タイトルを入力してください'); return }
    await api('add_announcement', form)
    setForm({ date: today(), title: '', body: '', pinned: false }); setComposing(false)
    showToast('✅ お知らせを掲載しました')
  }

  async function sendReply(annId: string) {
    const body = (replyDrafts[annId] || '').trim()
    if (!body) return
    await api('add_reply', { announcementId: annId, body })
    setReplyDrafts(prev => ({ ...prev, [annId]: '' }))
    showToast('✅ 返信しました')
  }

  const sorted = [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.date.localeCompare(a.date))

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 } as any,
    boxHead: { padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    boxBody: { padding: 20 },
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: 'var(--muted)', display: 'block', marginBottom: 6 },
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%' },
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    btnGhost: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' },
    delBtn: { background: '#FBE0DE', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  }

  function roleColor(r: string) {
    return r === '生産者' ? 'var(--accent)' : r === '販売者' ? 'var(--accent2)' : r === '組合管理者' ? 'var(--warn)' : 'var(--muted)'
  }

  return (
    <AppShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>📢 お知らせ・情報共有</h2>
        {isAdmin && <button style={s.btnGhost} onClick={() => setComposing(!composing)}>{composing ? '× 閉じる' : '＋ 新規通達'}</button>}
      </div>

      {isAdmin && composing && (
        <div style={s.box}>
          <div style={s.boxHead}>新しいお知らせ</div>
          <div style={s.boxBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={s.label}>日付</label><input type="date" style={s.input} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><label style={s.label}>タイトル *</label><input style={s.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例: 共配スケジュール変更のお知らせ" /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>本文</label>
              <textarea style={{ ...s.input, minHeight: 100, resize: 'vertical' }} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="組合員・販売会社へ共有する内容を入力" />
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
      ) : sorted.map(a => {
        const replies = a.replies || []
        return (
          <div key={a.id} style={s.box}>
            <div style={s.boxHead}>
              <span>{a.pinned && '📌 '}{a.title}</span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{a.date}</span>
                {isAdmin && <button style={s.delBtn} onClick={() => { if (confirm('このお知らせを削除しますか？')) api('remove_announcement', { id: a.id }) }}>削除</button>}
              </span>
            </div>
            <div style={s.boxBody}>
              {a.body && <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 16 }}>{a.body}</div>}

              {/* 返信スレッド */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>💬 返信 {replies.length > 0 && `(${replies.length})`}</div>
                {replies.map(r => (
                  <div key={r.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <span style={{ color: roleColor(r.role) }}>●</span> {r.author}
                        {r.role && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{r.role}</span>}
                      </span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--muted)' }}>{r.date}</span>
                        {(isAdmin || r.author === me.name) && <button onClick={() => api('remove_reply', { announcementId: a.id, replyId: r.id })} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>×</button>}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{r.body}</div>
                  </div>
                ))}
                {me.role && me.role !== 'guest' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input
                      style={s.input}
                      value={replyDrafts[a.id] || ''}
                      onChange={e => setReplyDrafts(prev => ({ ...prev, [a.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') sendReply(a.id) }}
                      placeholder="返信を入力..."
                    />
                    <button style={s.btn} onClick={() => sendReply(a.id)}>返信</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
