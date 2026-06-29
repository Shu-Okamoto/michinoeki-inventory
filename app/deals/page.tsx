'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

const today = () => new Date().toISOString().slice(0, 10)
const yen = (n: number) => '¥' + (Number(n) || 0).toLocaleString()

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  shipped:       { label: '出荷済（出荷確認・検品待ち）', color: '#9A6B00', bg: '#FCEFCF' },
  confirmed:     { label: '販売中', color: '#176B86', bg: '#D7EEF4' },
  sales_entered: { label: '販売中', color: '#176B86', bg: '#D7EEF4' },
  completed:     { label: '販売完了（組合確認待ち）', color: '#2E6B17', bg: '#DCEFD2' },
  settled:       { label: '精算済', color: '#5A5446', bg: '#ECE6D8' },
  canceled:      { label: '取消', color: '#B23B37', bg: '#FBE0DE' },
}
const typeLabel = (t: string) => t === '卸売' ? '買取（卸売）' : '産直委託'
// 種別でステータス表記を出し分け
function statusLabel(t: any): string {
  const buyout = t.type === '卸売'
  switch (t.status) {
    case 'shipped': return buyout ? '納品登録済（検品待ち）' : '出荷済（出荷確認・検品待ち）'
    case 'confirmed': return buyout ? '検品中' : '販売中'
    case 'sales_entered': return '販売中'
    case 'completed': return buyout ? '検品完了（精算待ち）' : '販売完了（組合確認待ち）'
    case 'settled': return '精算済'
    case 'canceled': return '取消'
    default: return t.status
  }
}

const ACTIVE = ['shipped', 'confirmed', 'sales_entered']

export default function DealsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const myName = session?.user?.name || ''
  const isSuperAdmin = role === 'admin'
  const isAdmin = role === 'admin' || role === '組合パートナー' || role === '組合管理者'
  const isProducer = role === '生産者'
  const isSeller = role === '販売者' || isAdmin
  const canCreate = isAdmin || isProducer

  const [tx, setTx] = useState<any[]>([])
  const [master, setMaster] = useState<any>({ producers: [], products: [], locations: [] })
  const [filter, setFilter] = useState<string>('active')
  const [toast, setToast] = useState('')
  const [drafts, setDrafts] = useState<Record<string, any>>({})

  // 出荷登録フォーム
  const [type, setType] = useState('卸売')
  const [producer, setProducer] = useState('')
  const [seller, setSeller] = useState('')
  const [loc, setLoc] = useState('')
  const [prod, setProd] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(today())

  function loadTx() {
    fetch('/api/transactions').then(r => r.json()).then(d => setTx(d.transactions || []))
  }
  useEffect(() => {
    loadTx()
    // マスタ（生産者・商品・納品先）は初回のみ取得
    fetch('/api/inventory').then(r => r.json()).then(setMaster)
  }, [])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2800) }

  async function action(act: string, payload: any, okMsg?: string) {
    const res = await fetch('/api/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, payload }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { showToast('⚠️ ' + (j.error || '失敗しました')); return false }
    if (okMsg) showToast(okMsg)
    loadTx()
    return true
  }

  async function createTx() {
    const p = isProducer ? myName : producer
    // 買取(卸売)は登録時に納品数が無くてもOK（検品で確定）。産直は数量必須。
    const needQty = type !== '卸売'
    if (!type || !p || !prod || !date || (needQty && !qty)) { showToast('⚠️ 種別・生産者・商品・日付' + (needQty ? '・数量' : '') + 'は必須です'); return }
    const ok = await action('create',
      { type, date, producer: p, seller, location: loc, product: prod, shipQty: Number(qty) || 0 },
      type === '卸売' ? '✅ 納品を登録しました' : '✅ 出荷を登録しました')
    if (ok) { setQty('') }
  }

  function setDraft(id: string, k: string, v: any) { setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } })) }
  function dv(t: any, k: string, fallback: any) { const d = drafts[t.id] || {}; return d[k] !== undefined ? d[k] : fallback }

  // admin・組合パートナー共通: 生産者+組合パートナー。生産者: 自分のみ（選択不可）。
  const producerOpts = (master.producers || []).filter((p: any) => {
    if (p.disabled) return false
    return (p.role || '生産者') === '生産者' || p.role === '組合パートナー' || p.role === '組合管理者'
  })
  // admin・組合パートナー共通: 販売者+組合パートナー。
  const sellerOpts = (master.producers || []).filter((p: any) => {
    if (p.disabled) return false
    return p.role === '販売者' || p.role === '組合パートナー' || p.role === '組合管理者'
  })

  const counts: Record<string, number> = { all: tx.length, active: tx.filter(t => ACTIVE.includes(t.status)).length }
  Object.keys(STATUS_META).forEach(k => { counts[k] = tx.filter(t => t.status === k).length })

  const filtered = tx.filter(t => {
    if (filter === 'all') return true
    if (filter === 'active') return ACTIVE.includes(t.status)
    return t.status === filter
  })

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 } as any,
    label: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--muted)', display: 'block', marginBottom: 5 } as any,
    input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13, width: '100%', outline: 'none', fontFamily: 'inherit' } as any,
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as any,
    btn2: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as any,
    btnDanger: { background: '#FBE0DE', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' } as any,
    miniLabel: { fontSize: 10, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 3 } as any,
    miniInput: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 12, width: 90, outline: 'none', fontFamily: 'inherit' } as any,
  }

  return (
    <AppShell>
      {/* 出荷登録 */}
      {canCreate && (
        <div style={s.box}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{type === '卸売' ? '🆕 納品を登録（買取・組合）' : '🆕 出荷を登録（産直委託の起点）'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={s.label}>取引種別</label>
              <select style={s.input} value={type} onChange={e => setType(e.target.value)}>
                <option value="産直">産直委託（実売基準）</option>
                <option value="卸売">買取（卸売・納品数基準）</option>
              </select>
            </div>
            <div>
              <label style={s.label}>生産者</label>
              {isProducer
                ? <input style={{ ...s.input, opacity: .7 }} value={myName} disabled />
                : <select style={s.input} value={producer} onChange={e => setProducer(e.target.value)}>
                    <option value="">選択</option>
                    {producerOpts.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>}
            </div>
            <div>
              <label style={s.label}>販売先（買い手）</label>
              <select style={s.input} value={seller} onChange={e => setSeller(e.target.value)}>
                <option value="">未定</option>
                {type !== '卸売' && <option value="組合">組合（検品後に組合が販売先へ分配）</option>}
                {sellerOpts.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>商品</label>
              <select style={s.input} value={prod} onChange={e => setProd(e.target.value)}>
                <option value="">選択</option>
                {(master.products || []).filter((p: any) => {
                  if ((p.status || 'approved') !== 'approved') return false
                  const sel = isProducer ? myName : producer
                  return !p.producer || !sel || p.producer === sel
                }).map((p: any) => <option key={p.id || p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>納品先（任意）</label>
              <select style={s.input} value={loc} onChange={e => setLoc(e.target.value)}>
                <option value="">未指定</option>
                {(master.locations || []).filter((l: any) => { const sel = isProducer ? myName : producer; return !l.producer || !sel || l.producer === sel }).map((l: any) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>{type === '卸売' ? '納品数' : '出荷数'}</label>
              <input style={s.input} type="number" min="0" step="0.1" value={qty} onChange={e => setQty(e.target.value)} placeholder="20" />
            </div>
            <div>
              <label style={s.label}>取引日</label>
              <input style={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <button style={s.btn} onClick={createTx}>{type === '卸売' ? '📥 納品を登録する' : '📦 出荷を登録する'}</button>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>単価は商品マスタ、手数料率は設定の既定値が自動適用されます（組合が確認時に調整可能）。</p>
        </div>
      )}

      {/* フィルタ */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['active', `進行中 (${counts.active})`],
          ['all', `すべて (${counts.all})`],
          ['shipped', `組合確認待ち (${counts.shipped})`],
          ['confirmed', `販売待ち (${counts.confirmed})`],
          ['sales_entered', `成立待ち (${counts.sales_entered})`],
          ['completed', `成立 (${counts.completed})`],
          ['settled', `精算済 (${counts.settled})`],
        ].map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k as string)}
            style={{ ...s.btn2, ...(filter === k ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* 取引一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ ...s.box, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>該当する取引がありません</div>
        )}
        {filtered.map(t => {
          const meta = STATUS_META[t.status] || STATUS_META.shipped
          const basisQty = t.billingQty ?? (t.type === '卸売' ? t.deliveryQty : t.salesQty)
          const hasBreakdown = t.type !== '卸売' && ((t.discountQty || 0) > 0 || (t.souzaiQty || 0) > 0)
          const gradeBreak = t.type === '卸売' && ((t.gradeAQty || 0) + (t.gradeBQty || 0)) > 0
          const u = t.unit || ''
          const shelf = Math.round(Math.max(0, (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0) - (t.souzaiQty || 0) - (t.discountQty || 0) - (t.discardQty || 0)) * 10) / 10
          return (
            <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              {/* ヘッダー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: t.type === '卸売' ? '#E7DCF4' : '#DCEFD2', color: t.type === '卸売' ? '#5B3B86' : '#2E6B17' }}>{typeLabel(t.type)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: meta.bg, color: meta.color }}>{statusLabel(t)}</span>
                <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 11, color: 'var(--muted)' }}>{t.date}</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700 }}>{t.product}</span>
              </div>

              {/* 当事者 */}
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                <span>生産者: <b style={{ color: 'var(--text)' }}>{t.producer || '—'}</b></span>
                <span>販売者: <b style={{ color: 'var(--text)' }}>{t.seller || '未定'}</b></span>
                {t.location && <span>納品先: <b style={{ color: 'var(--text)' }}>{t.location}</b></span>}
              </div>

              {/* 数量の流れ */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontFamily: 'Space Mono,monospace', fontSize: 13 }}>
                {t.type === '卸売' ? (<>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>納品</span><b>{t.deliveryQty || t.shipQty || 0}{u}</b>
                  {(t.confirmedQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>確認</span><b>{t.confirmedQty}{u}</b></>)}
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>A品</span><b>{t.gradeAQty || 0}{u}</b>
                  <span style={{ color: 'var(--muted)' }}>/</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>B品</span><b>{t.gradeBQty || 0}{u}</b>
                  {(t.discardQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>不良品</span><b>{t.discardQty}{u}</b></>)}
                </>) : (<>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>出荷</span><b>{t.shipQty}{u}</b>
                <span style={{ color: 'var(--muted)' }}>→</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>納品</span><b>{t.deliveryQty}{u}</b>
                <span style={{ color: 'var(--muted)' }}>→</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>実売</span><b>{t.salesQty}{u}</b>
                {t.type !== '卸売' && (t.discountQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>割引</span><b>{t.discountQty}{u}</b></>)}
                {t.type !== '卸売' && (t.souzaiQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>惣菜</span><b>{t.souzaiQty}{u}</b></>)}
                {t.type !== '卸売' && (t.retrievedQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>引取</span><b>{t.retrievedQty}{u}</b></>)}
                {t.type !== '卸売' && (t.discardQty || 0) > 0 && (<><span style={{ color: 'var(--muted)' }}>/</span><span style={{ color: 'var(--muted)', fontSize: 11 }}>廃棄</span><b>{t.discardQty}{u}</b></>)}
                {t.type !== '卸売' && (<span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--surface2)', color: 'var(--text)' }}>
                  棚残 {shelf}{u}
                </span>)}
                {t.lastSalesDate && (t.status === 'confirmed' || t.status === 'sales_entered') && (
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>（最終売上 {t.lastSalesDate}）</span>
                )}
                </>)}
              </div>

              {/* 金額（ロール別に表示を統制） */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '6px 18px', fontSize: 12, marginBottom: 12 }}>
                <span>単価: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.unitPrice)}</b></span>
                <span>請求数量({t.type === '卸売' ? 'A品＋B品' : '実売＋割引＋惣菜'}): <b style={{ fontFamily: 'Space Mono,monospace' }}>{basisQty}</b></span>

                {/* 組合管理者: すべて */}
                {isAdmin && <>
                  <span>{t.type === '卸売' ? '買取金額' : '販売金額'}: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.amount)}</b></span>
                  <span>手数料({t.commissionRate}%): <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.commission)}</b></span>
                  <span style={{ color: 'var(--accent)' }}>生産者請求: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.producerAmount)}</b></span>
                  <span style={{ color: 'var(--accent2)' }}>販売者請求: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.sellerAmount)}</b></span>
                  {hasBreakdown && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　実売 {yen(t.retailAmount)} ／ 割引 {yen(t.discountAmount)} ／ 惣菜 {yen(t.souzaiAmount)}</span>}
                  {gradeBreak && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　A品 {t.gradeAQty}{u}×{yen(t.gradeAPrice)} ／ B品 {t.gradeBQty}{u}×{yen(t.gradeBPrice)}</span>}
                </>}

                {/* 生産者: 自分の受取額（満額）のみ。手数料・販売者請求は非表示 */}
                {isProducer && <>
                  <span style={{ color: 'var(--accent)' }}>受取額: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.producerAmount)}</b></span>
                  {hasBreakdown && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　実売 {yen(t.retailAmount)} ／ 割引 {yen(t.discountAmount)} ／ 惣菜 {yen(t.souzaiAmount)}</span>}
                  {gradeBreak && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　A品 {t.gradeAQty}{u}×{yen(t.gradeAPrice)} ／ B品 {t.gradeBQty}{u}×{yen(t.gradeBPrice)}</span>}
                </>}

                {/* 販売者: 自分の請求（支払）額のみ。生産者請求・手数料は非表示 */}
                {isSeller && <>
                  <span style={{ color: 'var(--accent2)' }}>ご請求額: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.sellerAmount)}</b></span>
                </>}
              </div>

              {/* アクション */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* 産直委託(販売先指定済): 販売者の出荷確認・検品OK（検品数=納品数を確定し販売中へ） */}
                {(isSeller || isAdmin) && t.type !== '卸売' && t.status === 'shipped' && t.seller !== '組合' && (
                  <>
                    <div><label style={s.miniLabel}>検品数</label><input style={s.miniInput} type="number" value={dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)} onChange={e => setDraft(t.id, 'deliveryQty', e.target.value)} /></div>
                    <button style={s.btn} onClick={() => action('inspect', { id: t.id, deliveryQty: Number(dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)) }, '✅ 検品OK（販売中へ）')}>検品OK（出荷確認）</button>
                  </>
                )}

                {/* 産直委託(組合宛て): 組合が検品し、複数の販売先へ分配して販売中へ */}
                {isAdmin && t.type !== '卸売' && t.status === 'shipped' && t.seller === '組合' && (
                  <div style={{ width: '100%', border: '1px dashed var(--accent2)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🏷️ 検品・販売先へ分配（出荷数 {t.shipQty}{u}）</div>
                    {(dv(t, 'allocs', [{ seller: '', location: '', qty: t.shipQty }]) as any[]).map((a: any, i: number, arr: any[]) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }}>
                        <div><label style={s.miniLabel}>販売先</label>
                          <select style={{ ...s.miniInput, width: 160 }} value={a.seller} onChange={e => { const n = [...arr]; n[i] = { ...a, seller: e.target.value }; setDraft(t.id, 'allocs', n) }}>
                            <option value="">選択</option>
                            {sellerOpts.map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                          </select></div>
                        <div><label style={s.miniLabel}>納品先</label>
                          <select style={{ ...s.miniInput, width: 140 }} value={a.location} onChange={e => { const n = [...arr]; n[i] = { ...a, location: e.target.value }; setDraft(t.id, 'allocs', n) }}>
                            <option value="">未指定</option>
                            {(master.locations || []).filter((l: any) => !l.producer || l.producer === t.producer).map((l: any) => <option key={l.id} value={l.name}>{l.name}</option>)}
                          </select></div>
                        <div><label style={s.miniLabel}>納品数</label><input style={s.miniInput} type="number" min="0" value={a.qty} onChange={e => { const n = [...arr]; n[i] = { ...a, qty: e.target.value }; setDraft(t.id, 'allocs', n) }} /></div>
                        {arr.length > 1 && <button style={s.btnDanger} onClick={() => setDraft(t.id, 'allocs', arr.filter((_: any, j: number) => j !== i))}>−</button>}
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button style={s.btn2} onClick={() => { const arr = dv(t, 'allocs', [{ seller: '', location: '', qty: t.shipQty }]); setDraft(t.id, 'allocs', [...arr, { seller: '', location: '', qty: '' }]) }}>＋ 販売先を追加</button>
                      <button style={s.btn} onClick={() => {
                        const arr = (dv(t, 'allocs', []) as any[]).filter((a: any) => a.seller && Number(a.qty) > 0)
                        if (arr.length === 0) { return }
                        action('distribute', { id: t.id, allocations: arr.map((a: any) => ({ seller: a.seller, location: a.location, qty: Number(a.qty) })) }, '✅ 検品・分配しました（販売中へ）')
                      }}>検品・分配する</button>
                    </div>
                  </div>
                )}

                {/* 買取(卸売): 組合の検品（納品数・納品確認数・A品/B品 等級別単価・不良品） */}
                {isAdmin && t.type === '卸売' && (t.status === 'shipped' || t.status === 'confirmed') && (() => {
                  const gDelivery = Number(dv(t, 'gDelivery', t.deliveryQty || t.shipQty || 0)) || 0
                  const gConfirmed = Number(dv(t, 'confirmedQty', t.confirmedQty || t.deliveryQty || t.shipQty || 0)) || 0
                  const gTotal = Math.round(((Number(dv(t, 'aQty', t.gradeAQty || 0)) || 0) + (Number(dv(t, 'bQty', t.gradeBQty || 0)) || 0) + (Number(dv(t, 'discardQty', t.discardQty || 0)) || 0)) * 10) / 10
                  const over = gDelivery > 0 && (gTotal > Math.round(gDelivery * 10) / 10 || Math.round(gConfirmed * 10) / 10 > Math.round(gDelivery * 10) / 10)
                  const gradePayload = () => ({
                    id: t.id,
                    deliveryQty: Number(dv(t, 'gDelivery', t.deliveryQty || t.shipQty || 0)),
                    confirmedQty: Number(dv(t, 'confirmedQty', t.confirmedQty || t.deliveryQty || t.shipQty || 0)),
                    aQty: Number(dv(t, 'aQty', t.gradeAQty || 0)), aPrice: Number(dv(t, 'aPrice', t.gradeAPrice || t.unitPrice)),
                    bQty: Number(dv(t, 'bQty', t.gradeBQty || 0)), bPrice: Number(dv(t, 'bPrice', t.gradeBPrice || 0)),
                    discardQty: Number(dv(t, 'discardQty', t.discardQty || 0)),
                    commissionRate: Number(dv(t, 'commissionRate', t.commissionRate)),
                  })
                  return (
                  <div style={{ width: '100%', border: '1px dashed var(--accent2)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔍 検品（買取）</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div><label style={s.miniLabel}>納品数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'gDelivery', t.deliveryQty || t.shipQty || 0)} onChange={e => setDraft(t.id, 'gDelivery', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>納品確認数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'confirmedQty', t.confirmedQty || t.deliveryQty || t.shipQty || 0)} onChange={e => setDraft(t.id, 'confirmedQty', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>A品数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'aQty', t.gradeAQty || 0)} onChange={e => setDraft(t.id, 'aQty', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>A単価(円)</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'aPrice', t.gradeAPrice || t.unitPrice)} onChange={e => setDraft(t.id, 'aPrice', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>B品数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'bQty', t.gradeBQty || 0)} onChange={e => setDraft(t.id, 'bQty', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>B単価(割引・円)</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'bPrice', t.gradeBPrice || 0)} onChange={e => setDraft(t.id, 'bPrice', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>不良品数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'discardQty', t.discardQty || 0)} onChange={e => setDraft(t.id, 'discardQty', e.target.value)} /></div>
                      <div><label style={s.miniLabel}>手数料率(%)</label><input style={s.miniInput} type="number" step="0.1" value={dv(t, 'commissionRate', t.commissionRate)} onChange={e => setDraft(t.id, 'commissionRate', e.target.value)} /></div>
                      <button style={{ ...s.btn2, opacity: over ? 0.5 : 1, cursor: over ? 'not-allowed' : 'pointer' }} disabled={over} onClick={() => action('grade', gradePayload(), '✅ 検品を途中保存しました')}>途中保存</button>
                      <button style={{ ...s.btn, opacity: over ? 0.5 : 1, cursor: over ? 'not-allowed' : 'pointer' }} disabled={over} onClick={() => action('grade', { ...gradePayload(), complete: true }, '🎉 検品確定（成立・精算待ちへ）')}>検品確定（成立）</button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: over ? 'var(--danger)' : 'var(--muted)' }}>
                      検品計（A品＋B品＋不良品）<b>{gTotal}{u}</b> ／ 納品数 <b>{gDelivery}{u}</b>
                      {over && <span style={{ fontWeight: 700 }}>　⚠️ 納品数を超えています（A品＋B品＋不良品・納品確認数は納品数以内にしてください）</span>}
                    </div>
                  </div>
                  )
                })()}

                {/* 販売者: 当日の売上登録（産直委託のみ。買取は検品で成立し売上登録なし） */}
                {(isSeller || isAdmin) && t.type !== '卸売' && (t.status === 'confirmed' || t.status === 'sales_entered') && (
                  <div style={{ width: '100%', background: '#EFF7EA', border: '1px solid var(--accent)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>📒 本日の売上登録</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>残数 <b style={{ color: 'var(--text)' }}>{shelf}{u}</b>（売れた数だけ入力して登録。残数は翌日に繰り越されます）</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div><label style={s.miniLabel}>本日売れた数</label><input style={{ ...s.miniInput, width: 110, fontSize: 15, padding: '8px 10px' }} type="number" min="0" max={shelf} placeholder="0" value={dv(t, 'addQty', '')} onChange={e => setDraft(t.id, 'addQty', e.target.value)} /></div>
                      <button style={{ ...s.btn, padding: '10px 22px' }} onClick={async () => { const ok = await action('add_sales', { id: t.id, addQty: Number(dv(t, 'addQty', 0)) }, '✅ 本日の売上を登録しました'); if (ok) setDraft(t.id, 'addQty', '') }}>売上登録</button>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>日報システム等からのAPI連携でも自動登録できます</span>
                    </div>
                  </div>
                )}

                {/* 棚残の処理（産直のみ・販売中） */}
                {t.type !== '卸売' && (t.status === 'confirmed' || t.status === 'sales_entered') && (
                  <>
                    <div style={{ width: '100%', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginTop: 2 }}>残数の処理（割引・惣菜・引取・廃棄）※数量は累計で入力</div>
                    {/* 販売者: 割引販売（半額〜定価） */}
                    {(isSeller || isAdmin) && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', padding: '4px 8px', border: '1px dashed var(--border)', borderRadius: 8 }}>
                        <div><label style={s.miniLabel}>割引数</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'discountQty', t.discountQty || 0)} onChange={e => setDraft(t.id, 'discountQty', e.target.value)} /></div>
                        <div><label style={s.miniLabel}>割引単価(≧半額{Math.ceil((t.unitPrice || 0) * 0.5)})</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'discountUnitPrice', t.discountUnitPrice || Math.ceil((t.unitPrice || 0) * 0.5))} onChange={e => setDraft(t.id, 'discountUnitPrice', e.target.value)} /></div>
                        <button style={s.btn2} onClick={() => action('discount_sale', { id: t.id, discountQty: Number(dv(t, 'discountQty', t.discountQty || 0)), discountUnitPrice: Number(dv(t, 'discountUnitPrice', t.discountUnitPrice || Math.ceil((t.unitPrice || 0) * 0.5))) }, '✅ 割引販売を記録しました')}>割引販売</button>
                      </div>
                    )}
                    {/* 販売者: 惣菜利用（3割買取） */}
                    {(isSeller || isAdmin) && (
                      <div><label style={s.miniLabel}>惣菜数(3割)</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'souzaiQty', t.souzaiQty || 0)} onChange={e => setDraft(t.id, 'souzaiQty', e.target.value)} /></div>
                    )}
                    {(isSeller || isAdmin) && (
                      <button style={s.btn2} onClick={() => action('souzai', { id: t.id, souzaiQty: Number(dv(t, 'souzaiQty', t.souzaiQty || 0)) }, '✅ 惣菜利用を記録しました')}>惣菜利用</button>
                    )}
                    {/* 引取依頼（販売者が引取数を確定／生産者・組合も可） */}
                    {(isSeller || isProducer || isAdmin) && (
                      <div><label style={s.miniLabel}>引取数（累計）</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'retrievedQty', t.retrievedQty || 0)} onChange={e => setDraft(t.id, 'retrievedQty', e.target.value)} /></div>
                    )}
                    {(isSeller || isProducer || isAdmin) && (
                      <button style={s.btn2} onClick={() => action('retrieve', { id: t.id, retrievedQty: Number(dv(t, 'retrievedQty', t.retrievedQty || 0)) }, '✅ 引取依頼を記録しました')}>引取依頼</button>
                    )}
                    {/* 廃棄（無償・棚残から減算） */}
                    {(isSeller || isAdmin) && (
                      <div><label style={s.miniLabel}>廃棄数（累計）</label><input style={s.miniInput} type="number" min="0" value={dv(t, 'discardQty', t.discardQty || 0)} onChange={e => setDraft(t.id, 'discardQty', e.target.value)} /></div>
                    )}
                    {(isSeller || isAdmin) && (
                      <button style={s.btn2} onClick={() => action('discard', { id: t.id, discardQty: Number(dv(t, 'discardQty', t.discardQty || 0)) }, '✅ 廃棄を記録しました')}>廃棄</button>
                    )}
                  </>
                )}

                {/* 組合: 取消・削除 */}
                {isAdmin && t.status !== 'settled' && t.status !== 'canceled' && (
                  <button style={s.btnDanger} onClick={() => action('cancel', { id: t.id }, '取消しました')}>取消</button>
                )}
                {isSuperAdmin && (t.status === 'canceled' || t.status === 'shipped') && (
                  <button style={s.btnDanger} onClick={() => { if (confirm('この取引を完全に削除します。よろしいですか？')) action('delete', { id: t.id }, '削除しました') }}>削除</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--text)', boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
