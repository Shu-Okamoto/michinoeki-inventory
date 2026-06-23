'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [data, setData] = useState<any>({ locations:[], products:[], settings:{} })
  const [newLoc, setNewLoc] = useState(''); const [newLocProducer, setNewLocProducer] = useState(''); const [newProd, setNewProd] = useState(''); const [newUnit, setNewUnit] = useState(''); const [newPrice, setNewPrice] = useState(''); const [newProducer, setNewProducer] = useState('')
  const [kyohaiUrl, setKyohaiUrl] = useState('')
  const [commissionRate, setCommissionRate] = useState('')
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({})
  const [producerEdits, setProducerEdits] = useState<Record<string, string>>({})
  const [unitEdits, setUnitEdits] = useState<Record<string, string>>({})
  const [mail, setMail] = useState<any>({ enabled: false, fromEmail: '', sendTime: '17:00', subject: '', template: '' })
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { refresh() }, [])
  function refresh() { fetch('/api/inventory').then(r=>r.json()).then(d=>{
    setData(d)
    setKyohaiUrl(d.settings?.kyohaiUrl || 'https://coop-delivery.vercel.app/')
    setCommissionRate(String(d.settings?.commissionRate ?? ''))
    setMail({
      enabled: d.settings?.salesMail?.enabled || false,
      fromEmail: d.settings?.salesMail?.fromEmail || '',
      sendTime: d.settings?.salesMail?.sendTime || '17:00',
      subject: d.settings?.salesMail?.subject || '【いわくにアグリパートナーズ】{date} の産直品売上数のお知らせ',
      template: d.settings?.salesMail?.template || '',
    })
  }) }

  async function api(action: string, payload: any) {
    await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action,payload}) })
    refresh()
  }

  async function sendNow() {
    if (!confirm('本日分のレジ通過数を生産者へメール送信します。よろしいですか？')) return
    setSending(true)
    const res = await fetch('/api/inventory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'send_sales_mail',payload:{}}) })
    const d = await res.json()
    setSending(false)
    if (d.summary) showToast(`📧 送信${d.summary.sent}件 / スキップ${d.summary.skipped}件`)
    else showToast('❌ ' + (d.error || '送信に失敗しました'))
  }

  function showToast(m: string) { setToast(m); setTimeout(()=>setToast(''),3500) }

  const s = {
    box:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',marginBottom:24} as any,
    boxHead:{padding:'12px 16px',background:'var(--surface2)',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:600},
    boxBody:{padding:20},
    input:{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,outline:'none',fontFamily:'inherit',flex:1},
    btn:{background:'var(--accent)',color:'#0f1117',border:'none',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap' as any},
    row:{background:'var(--surface2)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:8,marginBottom:8},
    delBtn:{background:'#FBE0DE',color:'var(--danger)',border:'1px solid var(--danger)',borderRadius:6,padding:'3px 10px',fontSize:11,cursor:'pointer'},
  }

  return (
    <AppShell>
      <div style={s.box}>
        <div style={s.boxHead}>📍 道の駅の管理</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap' as any}}>
            <input style={s.input} value={newLoc} onChange={e=>setNewLoc(e.target.value)} placeholder="道の駅名（例: 道の駅 富士川楽座）" />
            <select style={{...s.input,maxWidth:200}} value={newLocProducer} onChange={e=>setNewLocProducer(e.target.value)}>
              <option value="">共通（ワークフローでも使用）</option>
              {(data.producers||[]).filter((x:any)=>(x.role||'生産者')==='生産者'&&!x.disabled).map((x:any)=><option key={x.id} value={x.name}>{x.name} 専用</option>)}
            </select>
            <button style={s.btn} onClick={async()=>{if(!newLoc)return;await api('add_location',{name:newLoc,producer:newLocProducer});setNewLoc('');setNewLocProducer('');showToast('✅ 追加しました')}}>＋ 追加</button>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>「共通」は全体で使え、産直/卸売ワークフローの納品先にもなります。生産者専用は、その生産者の納品先候補にのみ表示されます。</p>
          {data.locations.length===0
            ? <p style={{fontSize:12,color:'var(--muted)'}}>まだ登録がありません</p>
            : data.locations.map((l:any) => (
              <div key={l.id || l.name} style={s.row}>
                <span style={{flex:1,fontSize:13}}>📍 {l.name} {l.producer ? <span style={{fontSize:11,color:'var(--muted)'}}>（{l.producer} 専用）</span> : <span style={{fontSize:11,color:'var(--accent2)'}}>（共通）</span>}</span>
                <button style={s.delBtn} onClick={()=>api('remove_location',{id:l.id,name:l.name})}>削除</button>
              </div>
            ))
          }
        </div>
      </div>

      <div style={s.box}>
        <div style={s.boxHead}>🥦 商品マスタ管理</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap' as any}}>
            <select style={{...s.input,maxWidth:180}} value={newProducer} onChange={e=>setNewProducer(e.target.value)}>
              <option value="">生産者を選択</option>
              {(data.producers||[]).filter((p:any)=>((p.role||'生産者')==='生産者'||p.role==='組合パートナー'||p.role==='組合管理者')&&!p.disabled).map((p:any)=><option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <input style={s.input} value={newProd} onChange={e=>setNewProd(e.target.value)} placeholder="商品名（例: トマト大袋）" />
            <input style={{...s.input,maxWidth:110,flex:'none'}} list="unit-list" value={newUnit} onChange={e=>setNewUnit(e.target.value)} placeholder="単位（袋/本/KG）" />
            <input style={{...s.input,maxWidth:120,flex:'none'}} type="number" min="0" value={newPrice} onChange={e=>setNewPrice(e.target.value)} placeholder="単価(円)" />
            <button style={s.btn} onClick={async()=>{if(!newProd)return;await api('add_product',{name:newProd,producer:newProducer,unit:newUnit,unitPrice:Number(newPrice)||0});setNewProd('');setNewUnit('');setNewPrice('');setNewProducer('');showToast('✅ 追加しました')}}>＋ 追加</button>
          </div>
          <datalist id="unit-list"><option value="袋" /><option value="本" /><option value="個" /><option value="KG" /><option value="束" /><option value="パック" /><option value="箱" /></datalist>
          <p style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>単位は数量の表示に使われます（例: 袋・本・KG）。単価は売上・出荷の金額計算に使われます。</p>
          {data.products.length===0
            ? <p style={{fontSize:12,color:'var(--muted)'}}>まだ登録がありません</p>
            : [...data.products].sort((a:any,b:any)=>((a.status||'approved')==='pending'?-1:0)-((b.status||'approved')==='pending'?-1:0)).map((p:any) => {
              const pending = (p.status || 'approved') === 'pending'
              const pk = p.id || p.name
              return (
              <div key={pk} style={{...s.row, ...(pending?{background:'#FCF6E8'}:{})}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>
                    {p.name}
                    {pending && <span style={{marginLeft:8,fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:999,background:'#FCEFCF',color:'#9A6B00'}}>承認待ち{p.proposedBy?`・${p.proposedBy}`:''}</span>}
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>生産者: {p.producer || '—'}{p.unit?` ／ 単位: ${p.unit}`:''}</div>
                </div>
                <select
                  style={{...s.input,maxWidth:150,flex:'none',padding:'5px 8px'}}
                  value={producerEdits[pk] ?? (p.producer || '')}
                  onChange={e=>setProducerEdits({...producerEdits,[pk]:e.target.value})}
                >
                  <option value="">生産者なし</option>
                  {(data.producers||[]).filter((x:any)=>((x.role||'生産者')==='生産者'||x.role==='組合パートナー'||x.role==='組合管理者')&&!x.disabled).map((x:any)=><option key={x.id} value={x.name}>{x.name}</option>)}
                </select>
                <input
                  style={{...s.input,maxWidth:80,flex:'none',padding:'5px 8px'}} list="unit-list"
                  value={unitEdits[pk] ?? (p.unit || '')}
                  onChange={e=>setUnitEdits({...unitEdits,[pk]:e.target.value})}
                  placeholder="単位"
                />
                <input
                  style={{...s.input,maxWidth:96,flex:'none',padding:'5px 8px'}} type="number" min="0"
                  value={priceEdits[pk] ?? String(p.unitPrice ?? 0)}
                  onChange={e=>setPriceEdits({...priceEdits,[pk]:e.target.value})}
                />
                <span style={{fontSize:11,color:'var(--muted)'}}>円</span>
                {pending ? (
                  <>
                    <button style={{...s.btn,padding:'5px 10px',fontSize:11}} onClick={async()=>{await api('approve_product',{id:p.id,name:p.name,unitPrice:Number(priceEdits[pk] ?? p.unitPrice ?? 0)||0,producer:producerEdits[pk] ?? (p.producer||''),unit:unitEdits[pk] ?? (p.unit||'')});showToast('✅ 承認しました')}}>承認</button>
                    <button style={s.delBtn} onClick={()=>{if(confirm('この申請を却下（削除）しますか？'))api('reject_product',{id:p.id,name:p.name})}}>却下</button>
                  </>
                ) : (
                  <>
                    <button style={{...s.btn,padding:'5px 10px',fontSize:11}} onClick={async()=>{await api('update_product',{id:p.id,name:p.name,unitPrice:Number(priceEdits[pk] ?? p.unitPrice ?? 0)||0,producer:producerEdits[pk] ?? (p.producer||''),unit:unitEdits[pk] ?? (p.unit||'')});showToast('💾 保存しました')}}>保存</button>
                    <button style={s.delBtn} onClick={()=>api('remove_product',{id:p.id,name:p.name})}>削除</button>
                  </>
                )}
              </div>
            )})
          }
        </div>
      </div>
      <div style={s.box}>
        <div style={s.boxHead}>🚚 共配システム連携</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8}}>
            <input style={s.input} value={kyohaiUrl} onChange={e=>setKyohaiUrl(e.target.value)} placeholder="共配システムのURL（例: https://...）" />
            <button style={s.btn} onClick={async()=>{await api('save_settings',{kyohaiUrl});showToast('✅ 保存しました')}}>💾 保存</button>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginTop:8}}>「共配システム」メニューからこのURLを開けるようになります</p>
        </div>
      </div>

      <div style={s.box}>
        <div style={s.boxHead}>💴 手数料率（精算用）</div>
        <div style={s.boxBody}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input style={{...s.input,maxWidth:120,flex:'none'}} type="number" min="0" max="100" step="0.1" value={commissionRate} onChange={e=>setCommissionRate(e.target.value)} placeholder="例: 15" />
            <span style={{fontSize:13,color:'var(--muted)'}}>%</span>
            <button style={s.btn} onClick={async()=>{await api('save_settings',{commissionRate:Number(commissionRate)||0});showToast('✅ 保存しました')}}>💾 保存</button>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginTop:8}}>売上金額からこの率を差し引いた額が生産者への支払額（精算額）になります。売上メールの {'{net}'} に反映されます。</p>
        </div>
      </div>

      <div style={s.box}>
        <div style={s.boxHead}>📧 売上メール自動送信（生産者向け）</div>
        <div style={s.boxBody}>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,marginBottom:16,cursor:'pointer'}}>
            <input type="checkbox" checked={mail.enabled} onChange={e=>setMail({...mail,enabled:e.target.checked})} />
            指定時刻に自動送信を有効にする
          </label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:12}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:6}}>送信時刻（JST）</label>
              <input type="time" style={{...s.input,width:'100%'}} value={mail.sendTime} onChange={e=>setMail({...mail,sendTime:e.target.value})} />
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:6}}>送信元メールアドレス</label>
              <input style={{...s.input,width:'100%'}} value={mail.fromEmail} onChange={e=>setMail({...mail,fromEmail:e.target.value})} placeholder="例: noreply@yourdomain.jp" />
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:6}}>件名テンプレート</label>
            <input style={{...s.input,width:'100%'}} value={mail.subject} onChange={e=>setMail({...mail,subject:e.target.value})} />
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11,fontWeight:700,color:'var(--muted)',display:'block',marginBottom:6}}>本文テンプレート</label>
            <textarea style={{...s.input,width:'100%',minHeight:140,resize:'vertical',fontFamily:'inherit'}} value={mail.template} onChange={e=>setMail({...mail,template:e.target.value})} placeholder="空欄の場合は既定のテンプレートを使用します" />
            <p style={{fontSize:11,color:'var(--muted)',marginTop:6,lineHeight:1.7}}>使用できる差込: {'{producer}'} 生産者名 / {'{date}'} 日付 / {'{items}'} 品目明細 / {'{total}'} 合計点数 / {'{company}'} 所属 / {'{amount}'} 売上金額 / {'{commission}'} 手数料 / {'{net}'} 精算額 / {'{rate}'} 手数料率</p>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap' as any}}>
            <button style={s.btn} onClick={async()=>{await api('save_settings',{salesMail:{enabled:mail.enabled,fromEmail:mail.fromEmail,sendTime:mail.sendTime,subject:mail.subject,template:mail.template}});showToast('✅ 保存しました')}}>💾 保存</button>
            <button style={{...s.btn,background:'var(--accent2)'}} onClick={sendNow} disabled={sending}>{sending?'送信中...':'📤 今すぐ本日分を送信'}</button>
          </div>
          <p style={{fontSize:11,color:'var(--muted)',marginTop:10,lineHeight:1.7}}>
            ※ 送信には環境変数 <code>RESEND_API_KEY</code> が必要です。生産者ごとの「メール」欄が宛先になります。<br />
            ※ 自動送信は1時間ごとのCronで判定し、設定時刻を過ぎたら当日分を1回だけ送信します。
          </p>
        </div>
      </div>

      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'var(--surface2)',border:'1px solid var(--accent)',borderRadius:10,padding:'14px 20px',fontSize:13,color:'var(--accent)',zIndex:9999}}>{toast}</div>}
    </AppShell>
  )
}
