'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useMemo, useState } from 'react'

const yen = (n: number) => '¥' + (Number(n) || 0).toLocaleString()
const ORG_NAME = '協同組合いわくにアグリパートナーズ'

interface Inv { id: string; period: string; kind: 'producer' | 'seller'; party: string; subtotal: number; commission: number; total: number; status: string; transferred?: boolean; transferredAt?: string }

export default function MyInvoicesPage() {
  const [me, setMe] = useState<any>({})
  const [tx, setTx] = useState<any[]>([])
  const [invoices, setInvoices] = useState<Inv[]>([])
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => setMe(d.me || {}))
    fetch('/api/transactions').then(r => r.json()).then(d => { setTx(d.transactions || []); setInvoices(d.invoices || []) })
  }, [])

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 3000) }
  const role = me?.role || ''
  const kind: 'producer' | 'seller' = role === '販売者' ? 'seller' : 'producer'

  // 自分宛ての請求書を期間降順で
  const myInvoices = useMemo(() => [...invoices].sort((a, b) => b.period.localeCompare(a.period)), [invoices])

  // 指定期間の精算済み取引（自分の分）
  const settledOf = (period: string) => tx.filter(t => t.status === 'settled' && t.invoiceId === period)

  function printInvoice(inv: Inv) {
    const list = settledOf(inv.period)
    if (list.length === 0) { showToast('⚠️ 対象の明細が見つかりません'); return }
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])
    const issueDate = new Date().toISOString().slice(0, 10)
    const [py, pm] = inv.period.split('-').map(Number)
    const dueDate = `${pm === 12 ? py + 1 : py}-${String(pm === 12 ? 1 : pm + 1).padStart(2, '0')}-10`
    const taxIn8 = (a: number) => Math.floor(a * 8 / 108)
    const taxIn10 = (a: number) => Math.floor(a * 10 / 110)

    const commCell = (c: number) => kind === 'seller' ? `<td class="r">${yen(c)}</td>` : ''
    const rowsHtml = list.flatMap(t => {
      const u = esc(t.unit || '')
      const tl = t.type === '卸売' ? '買取' : '産直委託'
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
      const bq = Math.round((t.type === '卸売' ? (t.deliveryQty || 0) : ((t.salesQty || 0) + (t.discountQty || 0) + (t.souzaiQty || 0))) * 10) / 10
      return [`<tr><td>${esc(t.date)}</td><td>${esc(t.product)}</td><td>${esc(tl)}</td><td class="r">${bq}${u}</td><td class="r">${yen(t.unitPrice)}</td><td class="r">${yen(t.amount)}</td>${commCell(t.commission || 0)}</tr>`]
    }).join('')

    const surname = (name: string) => { const parts = name.trim().split(/\s+/); return parts.length > 1 ? parts[0] : name.slice(0, 2) }
    const seal = (name: string) => `<span class="seal">${esc(surname(name))}印</span>`

    const to = kind === 'producer' ? `${ORG_NAME} 御中` : `${esc(inv.party)} 御中`
    const from = kind === 'producer' ? esc(inv.party) : ORG_NAME
    const b = kind === 'producer' ? me?.self : null
    const total = kind === 'producer' ? inv.subtotal : inv.total
    const tax8 = taxIn8(inv.subtotal)
    const tax10 = kind === 'seller' ? taxIn10(inv.commission) : 0

    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>請求書 ${esc(inv.period)}</title>
      <style>
        body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#222;margin:0;padding:24px;}
        .inv{max-width:720px;margin:0 auto 32px;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;}
        .title{font-size:22px;font-weight:700;} .period{font-size:12px;color:#666;margin-top:4px;}
        .org{font-size:13px;font-weight:700;text-align:right;}
        .orglabel{font-size:10px;font-weight:400;color:#888;}
        .orgname{display:flex;align-items:center;justify-content:flex-end;gap:6px;}
        .orgline{font-size:11px;font-weight:400;color:#444;margin-top:2px;}
        .seal{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1.5px solid #c0392b;border-radius:50%;color:#c0392b;font-size:10px;font-weight:700;transform:rotate(-8deg);line-height:1;}
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
      <section class="inv">
        <div class="head">
          <div><div class="title">請求書</div>
          <div class="period">対象期間: ${esc(inv.period)}　発行日: ${esc(issueDate)}</div></div>
          <div class="org">
            <div class="orglabel">発行</div>
            <div class="orgname">${from}${seal(from)}</div>
            ${b?.address ? `<div class="orgline">${esc(b.address)}</div>` : ''}
            ${b?.bankAccountNumber ? `<div class="orgline">${esc(b.bankName)} ${esc(b.bankBranch)} ${esc(b.bankAccountType)} ${esc(b.bankAccountNumber)}　${esc(b.bankAccountHolder)}</div>` : ''}
          </div>
        </div>
        <div class="to">${to}</div>
        <div class="note">下記の通りご請求申し上げます。</div>
        <div class="due">お支払期日: <b>${esc(dueDate)}</b>（月末締め・翌月10日払い）</div>
        <table>
          <thead><tr><th>日付</th><th>商品</th><th>種別</th><th class="r">数量</th><th class="r">単価</th><th class="r">金額</th>${kind === 'seller' ? '<th class="r">手数料</th>' : ''}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="totals">
          <div>商品代金 計: <b>${yen(inv.subtotal)}</b>　<span class="tax">（うち消費税 8%対象: ${yen(tax8)}）</span></div>
          ${kind === 'seller' ? `<div>組合手数料 計: <b>${yen(inv.commission)}</b>　<span class="tax">（うち消費税 10%対象: ${yen(tax10)}）</span></div>` : ''}
          <div class="grand">ご請求額（税込）: <b>${yen(total)}</b></div>
          <div class="tax">内消費税合計: ${yen(tax8 + tax10)}（軽減税率8%対象 ${yen(inv.subtotal)} ／ 標準税率10%対象 ${kind === 'seller' ? yen(inv.commission) : yen(0)}）</div>
        </div>
      </section>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank')
    if (!w) { showToast('⚠️ ポップアップがブロックされました。許可してください'); return }
    w.document.write(html); w.document.close()
  }

  const s = {
    box: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 } as any,
    th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' },
    td: { padding: '11px 14px', borderTop: '1px solid var(--border)', fontSize: 13 },
    tdr: { padding: '11px 14px', borderTop: '1px solid var(--border)', fontSize: 13, textAlign: 'right' as const, fontFamily: 'Space Mono,monospace' },
    btn: { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as any,
  }

  if (role && role !== '生産者' && role !== '販売者') {
    return <AppShell><div style={{ ...s.box, textAlign: 'center', color: 'var(--muted)', padding: 40 }}>この画面は生産者・販売者向けです。組合は「月末締め・請求書」からご利用ください。</div></AppShell>
  }

  return (
    <AppShell>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🧾 自分の請求書</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>組合が月末締めで発行した請求書をダウンロード（印刷・PDF保存）できます。</p>

      {myInvoices.length === 0 ? (
        <div style={{ ...s.box, padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>発行済みの請求書はまだありません。</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--surface2)' }}>
              <th style={s.th}>対象期間</th>
              <th style={{ ...s.th, textAlign: 'right' }}>{kind === 'seller' ? 'ご請求額（税込）' : 'お支払額（税込）'}</th>
              {kind === 'producer' && <th style={s.th}>振込状況</th>}
              <th style={s.th}></th>
            </tr></thead>
            <tbody>
              {myInvoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{inv.period}</td>
                  <td style={{ ...s.tdr, fontWeight: 700 }}>{yen(inv.total)}</td>
                  {kind === 'producer' && (
                    <td style={s.td}>{inv.transferred
                      ? <span style={{ color: 'var(--accent)' }}>✅ 振込済（{inv.transferredAt}）</span>
                      : <span style={{ color: 'var(--warn)' }}>振込待ち</span>}</td>
                  )}
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button style={s.btn} onClick={() => printInvoice(inv)}>🖨️ ダウンロード</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 20px', fontSize: 13, color: 'var(--accent)', zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
