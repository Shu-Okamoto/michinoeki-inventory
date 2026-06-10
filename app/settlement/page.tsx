'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const yen = (n: number) => '¥' + (Number(n) || 0).toLocaleString()
const thisMonth = () => new Date().toISOString().slice(0, 7)
const ORG_NAME = '協同組合いわくにアグリパートナーズ'

interface Grp { party: string; tx: any[]; subtotal: number; commission: number; total: number }

function groupBy(tx: any[], key: 'producer' | 'seller'): Grp[] {
  const m = new Map<string, any[]>()
  for (const t of tx) {
    const k = t[key] || '（未割当）'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(t)
  }
  return [...m.entries()].map(([party, list]) => {
    const subtotal = list.reduce((a, t) => a + (t.amount || 0), 0)
    const commission = list.reduce((a, t) => a + (t.commission || 0), 0)
    return { party, tx: list, subtotal, commission, total: subtotal + commission }
  }).sort((a, b) => a.party.localeCompare(b.party, 'ja'))
}

export default function SettlementPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === '組合管理者'

  const [period, setPeriod] = useState(thisMonth())
  const [tx, setTx] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback((p: string) => {
    fetch(`/api/transactions?period=${p}`).then(r => r.json()).then(d => {
      setTx(d.transactions || []); setInvoices(d.invoices || [])
    })
  }, [])
  useEffect(() => { load(period) }, [period, load])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }

  // 精算対象（確認済み以降・未精算）/ 精算済
  // 産直は実売分で部分決算、卸売は納品数で全額決算。
  const SETTLE_STATUS = ['confirmed', 'sales_entered', 'completed']
  const pending = tx.filter(t => SETTLE_STATUS.includes(t.status) && !t.invoiceId)
  const settled = tx.filter(t => t.status === 'settled')

  const previewProducer = groupBy(pending, 'producer')
  const previewSeller = groupBy(pending, 'seller')
  const pendingCommission = pending.reduce((a, t) => a + (t.commission || 0), 0)
  const pendingSales = pending.reduce((a, t) => a + (t.amount || 0), 0)
  // 産直の棚残（納品−実売−引取−惣菜−割引）＝翌月へ繰越される分
  const onShelf = (t: any) => Math.max(0, (t.deliveryQty || 0) - (t.salesQty || 0) - (t.retrievedQty || 0) - (t.souzaiQty || 0) - (t.discountQty || 0) - (t.discardQty || 0))
  const carryovers = pending.filter(t => t.type !== '卸売' && t.status !== 'completed' && onShelf(t) > 0)
  const carryQty = carryovers.reduce((a, t) => a + onShelf(t), 0)

  async function confirmSettlement() {
    if (pending.length === 0) { showToast('⚠️ 精算対象（確認済み以降・未精算）の取引がありません'); return }
    if (!confirm(`${period} の精算対象 ${pending.length}件を決算し、請求書を発行します。\n` +
      `・産直は実売分で部分決算\n・卸売は納品数で全額決算\n` +
      (carryovers.length ? `・産直の売れ残り ${carryovers.length}件（計${carryQty}個）は翌月へ繰越\n` : '') +
      `よろしいですか？（発行後、対象取引は「精算済」になります）`)) return
    setBusy(true)
    const res = await fetch('/api/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_invoices', payload: { period } }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { showToast('⚠️ ' + (j.error || '発行に失敗しました')); return }
    const c = j.result?.carried ?? 0
    showToast(`🧾 ${j.result?.count ?? 0}件を精算しました${c ? `（${c}件を翌月へ繰越）` : ''}`)
    load(period)
  }

  function downloadCsv() {
    const src = invoices.length ? invoices : [
      ...previewProducer.map(g => ({ kind: 'producer', party: g.party, subtotal: g.subtotal, commission: 0, total: g.subtotal })),
      ...previewSeller.map(g => ({ kind: 'seller', party: g.party, subtotal: g.subtotal, commission: g.commission, total: g.total })),
    ]
    const [cy, cm] = period.split('-').map(Number)
    const due = `${cm === 12 ? cy + 1 : cy}-${String(cm === 12 ? 1 : cm + 1).padStart(2, '0')}-10`
    const rows: (string | number)[][] = [['種別', '対象', '販売金額', '手数料', '請求合計', '期間', '支払期日']]
    for (const inv of src) {
      rows.push([inv.kind === 'producer' ? '生産者請求' : '販売者請求', inv.party, inv.subtotal, inv.commission, inv.total, period, due])
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `請求一覧_${period}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // 請求書の印刷（精算済の取引から明細を構成して新規ウィンドウへ）
  function printInvoices() {
    const base = settled.length ? settled : pending
    if (base.length === 0) { showToast('⚠️ 印刷対象の取引がありません'); return }
    const prod = groupBy(base, 'producer')
    const sell = groupBy(base, 'seller')
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])

    // 発行日・支払期日（対象期間の翌月10日）
    const issueDate = new Date().toISOString().slice(0, 10)
    const [py, pm] = period.split('-').map(Number)
    const dueDate = `${pm === 12 ? py + 1 : py}-${String(pm === 12 ? 1 : pm + 1).padStart(2, '0')}-10`

    // 消費税（内税表示・金額は税込のまま）: 商品=軽減税率8%, 組合手数料=10%
    const taxIn8 = (amount: number) => Math.floor(amount * 8 / 108)
    const taxIn10 = (amount: number) => Math.floor(amount * 10 / 110)

    // 明細行: 買取(A品/B品入力あり)は等級ごとに行を分ける
    const rowsOf = (g: Grp, kind: 'producer' | 'seller') => g.tx.flatMap(t => {
      const u = esc(t.unit || '')
      const tl = t.type === '卸売' ? '買取' : '産直委託'
      const commCell = (c: number) => kind === 'seller' ? `<td class="r">${yen(c)}</td>` : ''
      if (t.type === '卸売' && ((t.gradeAQty || 0) + (t.gradeBQty || 0)) > 0) {
        const rows: string[] = []
        const rate = Number(t.commissionRate) || 0
        if ((t.gradeAQty || 0) > 0) {
          const amt = (t.gradeAQty || 0) * (t.gradeAPrice || 0)
          rows.push(`<tr><td>${esc(t.date)}</td><td>${esc(t.product)}（A品）</td><td>${esc(tl)}</td><td class="r">${t.gradeAQty}${u}</td><td class="r">${yen(t.gradeAPrice)}</td><td class="r">${yen(amt)}</td>${commCell(Math.floor(amt * rate / 100))}</tr>`)
        }
        if ((t.gradeBQty || 0) > 0) {
          const amt = (t.gradeBQty || 0) * (t.gradeBPrice || 0)
          rows.push(`<tr><td>${esc(t.date)}</td><td>${esc(t.product)}（B品）</td><td>${esc(tl)}</td><td class="r">${t.gradeBQty}${u}</td><td class="r">${yen(t.gradeBPrice)}</td><td class="r">${yen(amt)}</td>${commCell(Math.floor(amt * rate / 100))}</tr>`)
        }
        return rows
      }
      const bq = t.type === '卸売' ? (t.deliveryQty || 0) : ((t.salesQty || 0) + (t.discountQty || 0) + (t.souzaiQty || 0))
      return [`<tr><td>${esc(t.date)}</td><td>${esc(t.product)}</td><td>${esc(tl)}</td><td class="r">${bq}${u}</td><td class="r">${yen(t.unitPrice)}</td><td class="r">${yen(t.amount)}</td>${commCell(t.commission || 0)}</tr>`]
    }).join('')

    const invoiceBlock = (g: Grp, kind: 'producer' | 'seller') => {
      // 生産者請求書: 生産者 → 組合（宛先=組合）。販売者請求書: 組合 → 販売者（宛先=販売者）。
      const to = kind === 'producer' ? `${ORG_NAME} 御中` : `${esc(g.party)} 御中`
      const from = kind === 'producer' ? esc(g.party) : ORG_NAME
      const total = kind === 'producer' ? g.subtotal : g.total
      const tax8 = taxIn8(g.subtotal)
      const tax10 = kind === 'seller' ? taxIn10(g.commission) : 0
      return `
      <section class="inv">
        <div class="head">
          <div><div class="title">請求書</div>
          <div class="period">対象期間: ${esc(period)}　発行日: ${esc(issueDate)}</div></div>
          <div class="org"><div class="orglabel">発行</div>${from}</div>
        </div>
        <div class="to">${to}</div>
        <div class="note">${kind === 'producer'
          ? '下記の通りご請求申し上げます（産直品の販売金額・全額）。'
          : '下記の通りご請求申し上げます（販売金額＋組合手数料）。'}</div>
        <div class="due">お支払期日: <b>${esc(dueDate)}</b>（月末締め・翌月10日払い）</div>
        <table>
          <thead><tr><th>日付</th><th>商品</th><th>種別</th><th class="r">数量</th><th class="r">単価</th><th class="r">金額</th>${kind === 'seller' ? '<th class="r">手数料</th>' : ''}</tr></thead>
          <tbody>${rowsOf(g, kind)}</tbody>
        </table>
        <div class="totals">
          <div>商品代金 計: <b>${yen(g.subtotal)}</b>　<span class="tax">（うち消費税 8%対象: ${yen(tax8)}）</span></div>
          ${kind === 'seller' ? `<div>組合手数料 計: <b>${yen(g.commission)}</b>　<span class="tax">（うち消費税 10%対象: ${yen(tax10)}）</span></div>` : ''}
          <div class="grand">ご請求額（税込）: <b>${yen(total)}</b></div>
          <div class="tax">内消費税合計: ${yen(tax8 + tax10)}（軽減税率8%対象 ${yen(g.subtotal)} ／ 標準税率10%対象 ${kind === 'seller' ? yen(g.commission) : yen(0)}）</div>
        </div>
      </section>`
    }

    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>請求書 ${esc(period)}</title>
      <style>
        body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#222;margin:0;padding:24px;}
        .inv{page-break-after:always;max-width:720px;margin:0 auto 32px;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;}
        .title{font-size:22px;font-weight:700;} .period{font-size:12px;color:#666;margin-top:4px;}
        .org{font-size:13px;font-weight:700;text-align:right;}
        .orglabel{font-size:10px;font-weight:400;color:#888;}
        .to{font-size:18px;font-weight:700;margin:18px 0 6px;border-bottom:1px solid #333;display:inline-block;padding:0 24px 4px 0;}
        .note{font-size:12px;color:#555;margin-bottom:6px;}
        .due{font-size:13px;margin-bottom:12px;}
        .tax{font-size:11px;color:#777;font-weight:400;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border:1px solid #ccc;padding:6px 8px;} th{background:#f3f3f3;text-align:left;}
        .r{text-align:right;font-variant-numeric:tabular-nums;}
        .totals{margin-top:12px;text-align:right;font-size:13px;line-height:1.9;}
        .grand{font-size:16px;border-top:2px solid #333;padding-top:6px;margin-top:6px;}
        @media print{ body{padding:0;} }
      </style></head><body>
      ${prod.map(g => invoiceBlock(g, 'producer')).join('')}
      ${sell.map(g => invoiceBlock(g, 'seller')).join('')}
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { showToast('⚠️ ポップアップがブロックされました。許可してください'); return }
    w.document.write(html); w.document.close()
  }

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 } as any,
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as any,
    btn2: { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as any,
    th: { padding: '9px 12px', textAlign: 'left' as any, fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' },
    td: { padding: '9px 12px', borderTop: '1px solid var(--border)', fontSize: 13 },
    tdr: { padding: '9px 12px', borderTop: '1px solid var(--border)', fontSize: 13, textAlign: 'right' as any, fontFamily: 'Space Mono,monospace' },
    stat: { background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 160 } as any,
  }

  if (!isAdmin) {
    return <AppShell><div style={{ ...s.box, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>🔒 月末締め・請求書は組合管理者のみ利用できます。</div></AppShell>
  }

  const table = (title: string, groups: Grp[], showCommission: boolean, totalKind: 'producer' | 'seller') => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto', marginBottom: 16 }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, background: 'var(--surface2)' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={s.th}>対象</th><th style={s.th}>件数</th>
          <th style={{ ...s.th, textAlign: 'right' }}>販売金額</th>
          {showCommission && <th style={{ ...s.th, textAlign: 'right' }}>手数料</th>}
          <th style={{ ...s.th, textAlign: 'right' }}>{totalKind === 'producer' ? '支払額' : '請求額'}</th>
        </tr></thead>
        <tbody>
          {groups.length === 0 && <tr><td colSpan={showCommission ? 5 : 4} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)', padding: 28 }}>対象なし</td></tr>}
          {groups.map(g => (
            <tr key={g.party}>
              <td style={s.td}>{g.party}</td>
              <td style={s.td}>{g.tx.length}</td>
              <td style={s.tdr}>{yen(g.subtotal)}</td>
              {showCommission && <td style={s.tdr}>{yen(g.commission)}</td>}
              <td style={{ ...s.tdr, fontWeight: 700, color: totalKind === 'producer' ? 'var(--accent)' : 'var(--accent2)' }}>{yen(totalKind === 'producer' ? g.subtotal : g.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <AppShell>
      {/* 期間選択 */}
      <div style={{ ...s.box, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>対象期間</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 14, color: 'var(--text)', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button style={s.btn2} onClick={downloadCsv}>⬇️ CSV出力</button>
          <button style={s.btn2} onClick={printInvoices}>🖨️ 請求書を印刷</button>
        </div>
      </div>

      {/* サマリ */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={s.stat}><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>精算対象（成立・未精算）</div><div style={{ fontSize: 22, fontWeight: 700 }}>{pending.length}<span style={{ fontSize: 12, color: 'var(--muted)' }}> 件</span></div></div>
        <div style={s.stat}><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>販売金額 合計</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Space Mono,monospace' }}>{yen(pendingSales)}</div></div>
        <div style={s.stat}><div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>組合手数料 合計</div><div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--accent2)' }}>{yen(pendingCommission)}</div></div>
      </div>

      {/* 繰越プレビュー */}
      {carryovers.length > 0 && (
        <div style={{ ...s.box, borderColor: 'var(--warn)', background: '#FCF6E8' }}>
          <div style={{ fontSize: 13 }}>
            🔁 <b>{carryovers.length}件</b>（産直・計 <b>{carryQty}個</b>）が未完売です。締めると<b>実売分のみ決算</b>し、売れ残りは<b>翌月へ新規取引として繰越</b>されます（生産者が引き取れば繰越されません）。
          </div>
        </div>
      )}

      {/* プレビュー（未精算） */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>精算プレビュー（{period}・産直=実売分で部分決算 / 卸売=納品数で全額）</h2>
      {table('生産者請求書（各生産者 → 協同組合いわくにアグリパートナーズ 御中・全額）', previewProducer, false, 'producer')}
      {table('販売者請求書（協同組合いわくにアグリパートナーズ → 各販売者・販売金額＋手数料）', previewSeller, true, 'seller')}

      <div style={{ ...s.box, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          上記の内容で <b style={{ color: 'var(--text)' }}>{period}</b> を締め、請求書を発行します。<br />
          発行すると対象取引は「精算済」になり、二重精算されません。
        </div>
        <button style={{ ...s.btn, marginLeft: 'auto', opacity: busy || pending.length === 0 ? 0.5 : 1 }} disabled={busy || pending.length === 0} onClick={confirmSettlement}>
          {busy ? '処理中...' : `🧮 ${period} を締めて請求書発行`}
        </button>
      </div>

      {/* 発行済み請求書 */}
      {invoices.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 12px' }}>発行済み請求書（{period}）</h2>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['種別', '対象', '販売金額', '手数料', '合計', '状態'].map(h => <th key={h} style={{ ...s.th, textAlign: h === '対象' || h === '種別' || h === '状態' ? 'left' : 'right' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={s.td}>{inv.kind === 'producer' ? '生産者請求' : '販売者請求'}</td>
                    <td style={s.td}>{inv.party}</td>
                    <td style={s.tdr}>{yen(inv.subtotal)}</td>
                    <td style={s.tdr}>{yen(inv.commission)}</td>
                    <td style={{ ...s.tdr, fontWeight: 700 }}>{yen(inv.total)}</td>
                    <td style={s.td}>{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--text)', boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
