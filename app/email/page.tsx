'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'
import styles from './email.module.css'

interface ParsedItem { product: string; qty: number; checked: boolean }
interface EmailResult {
  id: string; subject: string; from: string; date: string; body: string
  parsed: Array<{ product: string; qty: number }>
}

export default function EmailPage() {
  const [labels, setLabels] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLabel, setSelectedLabel] = useState('')
  const [savedLabel, setSavedLabel] = useState<{ labelId: string; labelName: string; autoFetch: boolean } | null>(null)
  const [emails, setEmails] = useState<EmailResult[]>([])
  const [fetching, setFetching] = useState(false)
  const [applying, setApplying] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itemsMap, setItemsMap] = useState<Record<string, ParsedItem[]>>({})
  const [locationMap, setLocationMap] = useState<Record<string, string>>({})
  const [dateMap, setDateMap] = useState<Record<string, string>>({})

  useEffect(() => {
    // Gmailラベル一覧を取得
    fetch('/api/gmail/labels').then(r => r.json()).then(d => setLabels(d.labels || []))
    // 設定と道の駅一覧を取得
    fetch('/api/inventory').then(r => r.json()).then(d => {
      setLocations(d.locations || [])
      if (d.gmailSettings?.labelId) {
        setSavedLabel(d.gmailSettings)
        setSelectedLabel(d.gmailSettings.labelId)
      }
    })
  }, [])

  async function saveLabel() {
    const label = labels.find(l => l.id === selectedLabel)
    if (!label) return
    await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_gmail_settings', payload: {
        labelId: label.id, labelName: label.name, autoFetch: true
      }})
    })
    setSavedLabel({ labelId: label.id, labelName: label.name, autoFetch: true })
    showToast(`✅ 「${label.name}」を監視フォルダに設定しました`)
  }

  async function fetchEmails() {
    if (!selectedLabel) { showToast('⚠️ フォルダを選択してください'); return }
    setFetching(true)
    const res = await fetch(`/api/gmail?label=${encodeURIComponent(selectedLabel)}`)
    const data = await res.json()
    if (data.error) { showToast('❌ ' + data.error); setFetching(false); return }

    const emails: EmailResult[] = data.emails || []
    setEmails(emails)

    // 各メールのアイテムを初期化
    const map: Record<string, ParsedItem[]> = {}
    const locMap: Record<string, string> = {}
    const dMap: Record<string, string> = {}
    emails.forEach(e => {
      map[e.id] = e.parsed.map(p => ({ ...p, checked: true }))
      locMap[e.id] = ''
      dMap[e.id] = new Date().toISOString().slice(0,10)
    })
    setItemsMap(map)
    setLocationMap(locMap)
    setDateMap(dMap)
    setFetching(false)

    if (emails.length === 0) showToast('📭 未読メールはありません')
    else showToast(`📨 ${emails.length}件の未読メールを解析しました`)
  }

  async function applyEmail(emailId: string) {
    const items = (itemsMap[emailId] || []).filter(i => i.checked)
    const loc = locationMap[emailId]
    const date = dateMap[emailId]
    if (!loc) { showToast('⚠️ 道の駅を選択してください'); return }
    if (items.length === 0) { showToast('⚠️ 反映する商品を選択してください'); return }

    setApplying(emailId)
    const res = await fetch('/api/gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: emailId, location: loc, date, items })
    })
    const data = await res.json()
    if (data.ok) {
      showToast(`✅ ${data.count}件を反映し、既読にしました`)
      setEmails(prev => prev.filter(e => e.id !== emailId))
    } else {
      showToast('❌ ' + data.error)
    }
    setApplying('')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function toggleItem(emailId: string, idx: number) {
    setItemsMap(prev => ({
      ...prev,
      [emailId]: prev[emailId].map((item, i) => i === idx ? { ...item, checked: !item.checked } : item)
    }))
  }

  return (
    <AppShell>
      {/* ── フォルダ設定 ── */}
      <div className={styles.box}>
        <div className={styles.boxHeader}>
          <span>📂 監視するGmailフォルダ（ラベル）の設定</span>
          {savedLabel && (
            <span className={styles.savedBadge}>✓ 設定済: {savedLabel.labelName}</span>
          )}
        </div>
        <div className={styles.boxBody}>
          <div className={styles.row}>
            <select
              className={styles.select}
              value={selectedLabel}
              onChange={e => setSelectedLabel(e.target.value)}
            >
              <option value="">ラベルを選択してください</option>
              {labels.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button className={styles.btnPrimary} onClick={saveLabel} disabled={!selectedLabel}>
              💾 このフォルダを設定
            </button>
            <button
              className={styles.btnFetch}
              onClick={fetchEmails}
              disabled={!selectedLabel || fetching}
            >
              {fetching ? <><span className={styles.spinnerSm} /> 取得中...</> : '📨 未読メールを今すぐ取得'}
            </button>
          </div>
          <p className={styles.hint}>
            道の駅からの売上メールが届くフォルダ（ラベル）を指定してください。<br />
            「未読メールを取得」を押すと、そのフォルダの未読メールをClaudeが自動解析します。
          </p>
        </div>
      </div>

      {/* ── 解析結果 ── */}
      {emails.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              解析済みメール <span className={styles.count}>{emails.length}件</span>
            </h2>
          </div>

          <div className={styles.emailList}>
            {emails.map(email => (
              <div key={email.id} className={styles.emailCard}>
                {/* メールヘッダー */}
                <div className={styles.emailHead} onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}>
                  <div className={styles.emailMeta}>
                    <div className={styles.emailSubject}>{email.subject}</div>
                    <div className={styles.emailFrom}>{email.from} · {email.date}</div>
                  </div>
                  <div className={styles.emailBadge}>
                    {(itemsMap[email.id] || []).length}商品解析済
                  </div>
                  <div className={styles.chevron}>{expandedId === email.id ? '▲' : '▼'}</div>
                </div>

                {/* 展開エリア */}
                {expandedId === email.id && (
                  <div className={styles.emailBody}>
                    {/* メール本文プレビュー */}
                    <div className={styles.bodyPreview}>{email.body}</div>

                    {/* 解析結果 */}
                    <div className={styles.parsedSection}>
                      <div className={styles.parsedTitle}>🤖 Claude解析結果</div>
                      {(itemsMap[email.id] || []).length === 0 ? (
                        <p className={styles.noParsed}>商品が検出されませんでした</p>
                      ) : (
                        <div className={styles.parsedItems}>
                          {(itemsMap[email.id] || []).map((item, idx) => (
                            <label key={idx} className={styles.parsedItem}>
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => toggleItem(email.id, idx)}
                                className={styles.checkbox}
                              />
                              <span className={styles.parsedName}>{item.product}</span>
                              <span className={styles.parsedQty}>▼ {item.qty}個 販売</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 反映設定 */}
                    <div className={styles.applyRow}>
                      <select
                        className={styles.select}
                        value={locationMap[email.id] || ''}
                        onChange={e => setLocationMap(prev => ({ ...prev, [email.id]: e.target.value }))}
                      >
                        <option value="">道の駅を選択</option>
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={dateMap[email.id] || ''}
                        onChange={e => setDateMap(prev => ({ ...prev, [email.id]: e.target.value }))}
                      />
                      <button
                        className={styles.btnApply}
                        onClick={() => applyEmail(email.id)}
                        disabled={applying === email.id}
                      >
                        {applying === email.id ? '反映中...' : '✅ 在庫に反映・既読にする'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && <div className={styles.toast}>{toast}</div>}
    </AppShell>
  )
}
