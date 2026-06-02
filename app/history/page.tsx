'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

export default function HistoryPage() {
  const [sales, setSales] = useState<any[]>([])
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r=>r.json()).then(d=>setSales(d.sales||[])) }

  async function deleteSale(id: string) {
    if (!confirm('この売上記録を削除しますか？')) return
    await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_sale', payload: { id } })
    })
    refresh()
    setToast('🗑 削除しました')
    setTimeout(() => setToast(''), 2500)
  }

  const s = {
    th:{padding:'12px 16px',textAlign:'left' as any,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase' as any,color:'var(--muted)'},
    td:{padding:'12px 16px',borderTop:'1px solid var(--border)',fontSize:13},
    delBtn:{background:'#FBE0DE',color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer'},
  }

  const sorted = [...sales].reverse()
  const yen = (n: number) => '¥' + (n || 0).toLocaleString()
  const totalAmount = sales.reduce((a, s2) => a + Number(s2.amount || 0), 0)

  return (
    <AppShell>
      {totalAmount>0&&(
        <div style={{marginBottom:12,fontSize:13,color:'var(--muted)'}}>
          売上金額合計（全期間）: <span style={{fontFamily:'Space Mono,monospace',color:'var(--accent)',fontWeight:700}}>{yen(totalAmount)}</span>
        </div>
      )}
      <div style={{border:'1px solid var(--border)',borderRadius:12,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'var(--surface2)'}}>
            {['日付','生産者','販売先','商品','レジ通過数','単価','金額','入力方法',''].map(h=><th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.slice(0,200).map((s2:any)=>(
              <tr key={s2.id}>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',fontSize:11,color:'var(--muted)'}}>{s2.date}</td>
                <td style={s.td}>{s2.producer||'—'}</td>
                <td style={{...s.td,color:'var(--accent2)'}}>{s2.location}</td>
                <td style={s.td}>{s2.product}</td>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',color:'var(--accent)'}}>{s2.qty}点</td>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',color:'var(--muted)'}}>{Number(s2.unitPrice)>0?yen(s2.unitPrice):'—'}</td>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',color:'var(--text)'}}>{Number(s2.amount)>0?yen(s2.amount):'—'}</td>
                <td style={s.td}><span style={{background:'var(--surface2)',color:'var(--muted)',padding:'2px 8px',borderRadius:4,fontSize:11}}>{s2.method||'手動'}</span></td>
                <td style={s.td}><button style={s.delBtn} onClick={()=>deleteSale(s2.id)}>削除</button></td>
              </tr>
            ))}
            {sales.length===0&&<tr><td colSpan={9} style={{...s.td,textAlign:'center',color:'var(--muted)',padding:32}}>記録がありません</td></tr>}
          </tbody>
        </table>
      </div>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'var(--surface2)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 20px',fontSize:13,color:'var(--accent)',zIndex:9999}}>{toast}</div>}
    </AppShell>
  )
}
