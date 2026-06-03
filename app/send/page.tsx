'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

const today = () => new Date().toISOString().slice(0,10)

export default function SendPage() {
  const [data, setData] = useState<any>({ locations:[], products:[], shipments:[], producers:[] })
  const [producer, setProducer] = useState('')
  const [loc, setLoc] = useState(''); const [prod, setProd] = useState('')
  const [qty, setQty] = useState(''); const [date, setDate] = useState(today())
  const [toast, setToast] = useState('')
  // 商品申請フォーム
  const [propName, setPropName] = useState(''); const [propUnit, setPropUnit] = useState(''); const [propPrice, setPropPrice] = useState('')

  useEffect(() => { fetch('/api/inventory').then(r=>r.json()).then(setData) }, [])

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,payload}) })
    fetch('/api/inventory').then(r=>r.json()).then(setData)
  }

  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(''),2500) }

  async function addShipment() {
    if (!producer||!loc||!prod||!qty||!date) { showToast('⚠️ すべての項目を入力してください'); return }
    await api('add_shipment', { date, producer, location:loc, product:prod, qty:Number(qty) })
    setQty(''); showToast(`✅ ${loc} に ${prod} を ${qty}個 納品登録しました`)
  }

  async function proposeProduct() {
    if (!propName) { showToast('⚠️ 商品名を入力してください'); return }
    const res = await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'propose_product',payload:{name:propName,unit:propUnit,unitPrice:Number(propPrice)||0}}) })
    const j = await res.json().catch(()=>({}))
    if (!res.ok) { showToast('⚠️ '+(j.error||'申請に失敗しました')); return }
    setPropName(''); setPropUnit(''); setPropPrice('')
    fetch('/api/inventory').then(r=>r.json()).then(setData)
    showToast(j.status==='approved' ? '✅ 商品を登録しました' : '✅ 商品を申請しました（組合の承認待ち）')
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
        <h2 style={{fontSize:14,fontWeight:700,marginBottom:16}}>納品数入力</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:16}}>
          {[
            ['組合員（生産者）', <select style={s.input} value={producer} onChange={e=>setProducer(e.target.value)}>
              <option value="">選択</option>{(data.producers||[]).filter((p:any)=>(p.role||'生産者')==='生産者').map((p:any)=><option key={p.id} value={p.name}>{p.name}</option>)}</select>],
            ['納品先（道の駅）', <select style={s.input} value={loc} onChange={e=>setLoc(e.target.value)}>
              <option value="">選択</option>{data.locations.map((l:string)=><option key={l}>{l}</option>)}</select>],
            ['商品', <select style={s.input} value={prod} onChange={e=>setProd(e.target.value)}>
              <option value="">選択</option>{data.products.filter((p:any)=>(p.status||'approved')==='approved' && (!p.producer || !producer || p.producer===producer)).map((p:any)=><option key={p.name}>{p.name}</option>)}</select>],
            ['個数', <input style={s.input} type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="20" />],
            ['日付', <input style={s.input} type="date" value={date} onChange={e=>setDate(e.target.value)} />],
          ].map(([label, ctrl], i) => (
            <div key={i}><label style={s.label}>{label as string}</label>{ctrl as any}</div>
          ))}
        </div>
        <button style={s.btn} onClick={addShipment}>📦 納品登録する</button>
      </div>

      {/* 商品マスタの申請（生産者→組合が承認） */}
      <div style={s.box}>
        <h2 style={{fontSize:14,fontWeight:700,marginBottom:8}}>🌱 商品を申請</h2>
        <p style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>新しい商品は申請後、組合管理者の承認で使えるようになります（承認まで納品の商品選択には出ません）。</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          <input style={{...s.input,maxWidth:220}} value={propName} onChange={e=>setPropName(e.target.value)} placeholder="商品名（例: 白瓜）" />
          <input style={{...s.input,maxWidth:130}} list="unit-list" value={propUnit} onChange={e=>setPropUnit(e.target.value)} placeholder="単位（袋/本/KG）" />
          <input style={{...s.input,maxWidth:130}} type="number" min="0" value={propPrice} onChange={e=>setPropPrice(e.target.value)} placeholder="希望単価(円)" />
          <button style={s.btn} onClick={proposeProduct}>申請する</button>
        </div>
        <datalist id="unit-list"><option value="袋" /><option value="本" /><option value="個" /><option value="KG" /><option value="束" /><option value="パック" /><option value="箱" /></datalist>
        {(data.products||[]).filter((p:any)=>(p.status||'approved')==='pending').length>0 && (
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {(data.products||[]).filter((p:any)=>(p.status||'approved')==='pending').map((p:any)=>(
              <div key={p.name} style={{fontSize:12,color:'var(--muted)'}}>
                ⏳ <b style={{color:'var(--text)'}}>{p.name}</b> 承認待ち{p.proposedBy?`（申請: ${p.proposedBy}）`:''}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{border:'1px solid var(--border)',borderRadius:12,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'var(--surface2)'}}>
            {['日付','組合員','納品先','商品','納品数',''].map(h=><th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[...data.shipments].reverse().slice(0,30).map((sh:any) => (
              <tr key={sh.id}>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',fontSize:11,color:'var(--muted)'}}>{sh.date}</td>
                <td style={s.td}>{sh.producer || '—'}</td>
                <td style={{...s.td,color:'var(--accent2)'}}>{sh.location}</td>
                <td style={s.td}>{sh.product}</td>
                <td style={{...s.td,fontFamily:'Space Mono,monospace',color:'var(--accent)'}}>{sh.qty}個</td>
                <td style={s.td}>
                  <button onClick={()=>api('delete_shipment',{id:sh.id})} style={{background:'#FBE0DE',color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer'}}>削除</button>
                </td>
              </tr>
            ))}
            {data.shipments.length===0&&<tr><td colSpan={6} style={{...s.td,textAlign:'center',color:'var(--muted)',padding:32}}>納品記録がありません</td></tr>}
          </tbody>
        </table>
      </div>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'var(--surface2)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 20px',fontSize:13,color:'var(--accent)',zIndex:9999}}>{toast}</div>}
    </AppShell>
  )
}
