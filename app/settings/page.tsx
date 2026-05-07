'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [data, setData] = useState<any>({ locations:[], products:[] })
  const [newLoc, setNewLoc] = useState(''); const [newProd, setNewProd] = useState(''); const [newAlias, setNewAlias] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r=>r.json()).then(setData) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,payload}) })
    refresh()
  }

  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(''),2500) }

  const s = {
    box:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:24} as any,
    boxHead:{padding:'12px 16px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:600},
    boxBody:{padding:20},
    input:{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,outline:'none',fontFamily:'inherit',flex:1},
    btn:{background:'var(--accent)',color:'#0f1117',border:'none',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap' as any},
    row:{background:'var(--surface2)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:8,marginBottom:8},
    delBtn:{background:'#450a0a',color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer'},
  }

  return (
    <AppShell>
      <div style={s.box}>
        <div style={s.boxHead}>📍 道の駅の管理</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <input style={s.input} value={newLoc} onChange={e=>setNewLoc(e.target.value)} placeholder="道の駅名（例: 道の駅 富士川楽座）" />
            <button style={s.btn} onClick={async()=>{if(!newLoc)return;await api('add_location',{name:newLoc});setNewLoc('');showToast('✅ 追加しました')}}>＋ 追加</button>
          </div>
          {data.locations.length===0
            ? <p style={{fontSize:12,color:'var(--muted)'}}>まだ登録がありません</p>
            : data.locations.map((l:string) => (
              <div key={l} style={s.row}>
                <span style={{flex:1,fontSize:13}}>📍 {l}</span>
                <button style={s.delBtn} onClick={()=>api('remove_location',{name:l})}>削除</button>
              </div>
            ))
          }
        </div>
      </div>

      <div style={s.box}>
        <div style={s.boxHead}>🥦 商品マスタ管理</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap' as any}}>
            <input style={s.input} value={newProd} onChange={e=>setNewProd(e.target.value)} placeholder="商品名（例: トマト大袋）" />
            <input style={s.input} value={newAlias} onChange={e=>setNewAlias(e.target.value)} placeholder="別名・キーワード（例: トマト,大玉）" />
            <button style={s.btn} onClick={async()=>{if(!newProd)return;await api('add_product',{name:newProd,aliases:newAlias});setNewProd('');setNewAlias('');showToast('✅ 追加しました')}}>＋ 追加</button>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>別名はメール解析で商品を特定するキーワードです（カンマ区切り）</p>
          {data.products.length===0
            ? <p style={{fontSize:12,color:'var(--muted)'}}>まだ登録がありません</p>
            : data.products.map((p:any) => (
              <div key={p.name} style={s.row}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{p.name}</div>
                  {p.aliases&&<div style={{fontSize:11,color:'var(--muted)'}}>別名: {p.aliases}</div>}
                </div>
                <button style={s.delBtn} onClick={()=>api('remove_product',{name:p.name})}>削除</button>
              </div>
            ))
          }
        </div>
      </div>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'var(--surface2)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 20px',fontSize:13,color:'var(--accent)',zIndex:9999}}>{toast}</div>}
    </AppShell>
  )
}
