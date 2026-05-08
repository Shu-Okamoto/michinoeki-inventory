'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

const today = () => new Date().toISOString().slice(0,10)

export default function SendPage() {
  const [data, setData] = useState<any>({ locations:[], products:[], shipments:[] })
  const [loc, setLoc] = useState(''); const [prod, setProd] = useState('')
  const [qty, setQty] = useState(''); const [date, setDate] = useState(today())
  const [toast, setToast] = useState('')

  useEffect(() => { fetch('/api/inventory').then(r=>r.json()).then(setData) }, [])

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,payload}) })
    fetch('/api/inventory').then(r=>r.json()).then(setData)
  }

  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(''),2500) }

  async function addShipment() {
    if (!loc||!prod||!qty||!date) { showToast('⚠️ すべての項目を入力してください'); return }
    await api('add_shipment', { date, location:loc, product:prod, qty:Number(qty) })
    setQty(''); showToast(`✅ ${loc} に ${prod} を ${qty}個 出荷登録しました`)
  }

  const s = { box:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:24} as any,
    label:{fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase' as any,color:'var(--muted)',display:'block',marginBottom:6},
    input:{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,width:'100%',outline:'none',fontFamily:'inherit'},
    btn:{background:'var(--accent)',color:'#0f1117',border:'none',borderRadius:8,padding:'9px 18px',fontSize:13,fontWeight:600,cursor:'pointer'},
    th:{padding:'12px 16px',textAlign:'left' as any,fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase' as any,color:'var(--muted)'},
    td:{padding:'12px 16px',borderTop:'1px solid var(--border)',fontSize:13},
  }

  return (
    <AppShell>
      <div style={s.box}>
        <h2 style={{fontSize:14,fontWeight:700,marginBottom:16}}>出荷登録</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:16}}>
          {[
            ['道の駅', <select style={s.input} value={loc} onChange={e=>setLoc(e.target.value)}>
              <option value="">選択</option>{data.locations.map((l:string)=><option key={l}>{l}</option>)}</select>],
            ['商品', <select style={s.input} value={prod} onChange={e=>setProd(e.target.value)}>
              <option value="">選択</option>{data.products.map((p:any)=><option key={p.name}>{p.name}</option>)}</select>],
            ['個数', <input style={s.input} type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="20" />],
            ['日付', <input style={s.input} type="date" value={date} onChange={e=>setDate(e.target.value)} />],
          ].map(([label, ctrl], i) => (
            <div key={i}><label style={s.label}>{label as string}</label>{ctrl as any}</div>
          ))}
        </div>
        <button style={s.btn} onClick={addShipment}>📦 出荷登録する</button>
      </div>

      <div style={{border:'1px solid var(--border)',borderRadius:12,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'var(--surface2)'}}>
            {['日付','道の駅','商品','出荷数',''].map(h=><th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[...data.shipments].reverse().slice(0,30).map((sh:any) => (
              <tr key={sh.id}>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',fontSize:11,color:'var(--muted)'}}>{sh.date}</td>
                <td style={{...s.td,color:'var(--accent2)'}}>{sh.location}</td>
                <td style={s.td}>{sh.product}</td>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',color:'var(--accent)'}}>{sh.qty}個</td>
                <td style={s.td}>
                  <button onClick={()=>api('delete_shipment',{id:sh.id})} style={{background:'#450a0a',color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer'}}>削除</button>
                </td>
              </tr>
            ))}
            {data.shipments.length===0&&<tr><td colSpan={5} style={{...s.td,textAlign:'center',color:'var(--muted)',padding:32}}>出荷記録がありません</td></tr>}
          </tbody>
        </table>
      </div>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'var(--surface2)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 20px',fontSize:13,color:'var(--accent)',zIndex:9999}}>{toast}</div>}
    </AppShell>
  )
}
