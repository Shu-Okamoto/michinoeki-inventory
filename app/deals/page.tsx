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

const ACTIVE = ['shipped', 'confirmed', 'sales_entered']

export default function DealsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const myName = session?.user?.name || ''
  const isAdmin = role === '組合管理者'
  const isProducer = role === '生産者'
  const isSeller = role === '販売者'
  const canCreate = isAdmin || isProducer

  const [tx, setTx] = useState<any[]>([])
  const [master, setMaster] = useState<any>({ producers: [], products: [], locations: [] })
  const [filter, setFilter] = useState<string>('active')
  const [toast, setToast] = useState('')
  const [drafts, setDrafts] = useState<Record<string, any>>({})

  // 出荷登録フォーム
  const [type, setType] = useState('産直')
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
    if (!type || !p || !prod || !qty || !date) { showToast('⚠️ 種別・生産者・商品・数量・日付は必須です'); return }
    const ok = await action('create',
      { type, date, producer: p, seller, location: loc, product: prod, shipQty: Number(qty) },
      '✅ 出荷を登録しました')
    if (ok) { setQty('') }
  }

  function setDraft(id: string, k: string, v: any) { setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } })) }
  function dv(t: any, k: string, fallback: any) { const d = drafts[t.id] || {}; return d[k] !== undefined ? d[k] : fallback }

  const producerOpts = (master.producers || []).filter((p: any) => (p.role || '生産者') === '生産者')
  const sellerOpts = (master.producers || []).filter((p: any) => p.role === '販売者')

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
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🆕 出荷を登録（取引の起点）</h2>
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
              <label style={s.label}>販売者（買い手）</label>
              <select style={s.input} value={seller} onChange={e => setSeller(e.target.value)}>
                <option value="">未定</option>
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
                {(master.locations || []).map((l: string) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>出荷数</label>
              <input style={s.input} type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="20" />
            </div>
            <div>
              <label style={s.label}>取引日</label>
              <input style={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <button style={s.btn} onClick={createTx}>📦 出荷を登録する</button>
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
          const basisQty = t.type === '卸売' ? t.deliveryQty : (t.billingQty ?? t.salesQty)
          const hasBreakdown = t.type !== '卸売' && ((t.discountQty || 0) > 0 || (t.souzaiQty || 0) > 0)
          const u = t.unit || ''
          const shelf = Math.max(0, (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0) - (t.souzaiQty || 0) - (t.discountQty || 0) - (t.discardQty || 0))
          return (
            <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              {/* ヘッダー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: t.type === '卸売' ? '#E7DCF4' : '#DCEFD2', color: t.type === '卸売' ? '#5B3B86' : '#2E6B17' }}>{typeLabel(t.type)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: meta.bg, color: meta.color }}>{meta.label}</span>
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
              </div>

              {/* 金額（ロール別に表示を統制） */}
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '6px 18px', fontSize: 12, marginBottom: 12 }}>
                <span>単価: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.unitPrice)}</b></span>
                <span>請求数量({t.type === '卸売' ? '納品' : '実売＋割引＋惣菜'}): <b style={{ fontFamily: 'Space Mono,monospace' }}>{basisQty}</b></span>

                {/* 組合管理者: すべて */}
                {isAdmin && <>
                  <span>販売金額: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.amount)}</b></span>
                  <span>手数料({t.commissionRate}%): <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.commission)}</b></span>
                  <span style={{ color: 'var(--accent)' }}>生産者請求: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.producerAmount)}</b></span>
                  <span style={{ color: 'var(--accent2)' }}>販売者請求: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.sellerAmount)}</b></span>
                  {hasBreakdown && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　実売 {yen(t.retailAmount)} ／ 割引 {yen(t.discountAmount)} ／ 惣菜 {yen(t.souzaiAmount)}</span>}
                </>}

                {/* 生産者: 自分の受取額（満額）のみ。手数料・販売者請求は非表示 */}
                {isProducer && <>
                  <span style={{ color: 'var(--accent)' }}>受取額: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.producerAmount)}</b></span>
                  {hasBreakdown && <span style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 11 }}>内訳　実売 {yen(t.retailAmount)} ／ 割引 {yen(t.discountAmount)} ／ 惣菜 {yen(t.souzaiAmount)}</span>}
                </>}

                {/* 販売者: 自分の請求（支払）額のみ。生産者請求・手数料は非表示 */}
                {isSeller && <>
                  <span style={{ color: 'var(--accent2)' }}>ご請求額: <b style={{ fontFamily: 'Space Mono,monospace' }}>{yen(t.sellerAmount)}</b></span>
                </>}
              </div>

              {/* アクション */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* 産直委託: 販売者の出荷確認・検品OK（検品数=納品数を確定し販売中へ） */}
                {(isSeller || isAdmin) && t.type !== '卸売' && t.status === 'shipped' && (
                  <>
                    <div><label style={s.miniLabel}>検品数</label><input style={s.miniInput} type="number" value={dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)} onChange={e => setDraft(t.id, 'deliveryQty', e.target.value)} /></div>
                    <button style={s.btn} onClick={() => action('inspect', { id: t.id, deliveryQty: Number(dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)) }, '✅ 検品OK（販売中へ）')}>検品OK（出荷確認）</button>
                  </>
                )}

                {/* 買取(卸売): 組合が納品数・単価・手数料を確定 */}
                {isAdmin && t.type === '卸売' && (t.status === 'shipped' || t.status === 'confirmed') && (
                  <>
                    <div><label style={s.miniLabel}>納品数</label><input style={s.miniInput} type="number" value={dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)} onChange={e => setDraft(t.id, 'deliveryQty', e.target.value)} /></div>
                    <div><label style={s.miniLabel}>単価(円)</label><input style={s.miniInput} type="number" value={dv(t, 'unitPrice', t.unitPrice)} onChange={e => setDraft(t.id, 'unitPrice', e.target.value)} /></div>
                    <div><label style={s.miniLabel}>手数料率(%)</label><input style={s.miniInput} type="number" step="0.1" value={dv(t, 'commissionRate', t.commissionRate)} onChange={e => setDraft(t.id, 'commissionRate', e.target.value)} /></div>
                    <button style={s.btn} onClick={() => action('confirm', { id: t.id, deliveryQty: Number(dv(t, 'deliveryQty', t.deliveryQty || t.shipQty)), unitPrice: Number(dv(t, 'unitPrice', t.unitPrice)), commissionRate: Number(dv(t, 'commissionRate', t.commissionRate)) }, '✅ 納品数を確定しました')}>
                      {t.status === 'confirmed' ? '再確定' : '納品数を確定'}
                    </button>
                  </>
                )}

                {/* 販売者: 当日の売上登録（その日の販売数を加算。残数があれば翌日も進行中） */}
                {(isSeller || isAdmin) && (t.status === 'confirmed' || t.status === 'sales_entered') && (
                  <>
                    <div><label style={s.miniLabel}>本日の販売数（棚残{shelf}{u}）</label><input style={s.miniInput} type="number" min="0" max={shelf} placeholder="0" value={dv(t, 'addQty', '')} onChange={e => setDraft(t.id, 'addQty', e.target.value)} /></div>
                    <button style={s.btn} onClick={async () => { const ok = await action('add_sales', { id: t.id, addQty: Number(dv(t, 'addQty', 0)) }, '✅ 本日の売上を登録しました'); if (ok) setDraft(t.id, 'addQty', '') }}>売上登録</button>
                  </>
                )}

                {/* 買取(卸売): 販売者が受領確認 → 販売完了 */}
                {(isSeller || isAdmin) && t.type === '卸売' && t.status === 'sales_entered' && (
                  <button style={s.btn} onClick={() => action('complete', { id: t.id }, '🎉 取引が成立しました')}>受領確認（完了）</button>
                )}

                {/* 棚残の処理（産直のみ・販売待ち/販売入力済） */}
                {t.type !== '卸売' && (t.status === 'confirmed' || t.status === 'sales_entered') && (
                  <>
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
                {isAdmin && (t.status === 'canceled' || t.status === 'shipped') && (
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
