'use client'
import AppShell from '@/components/AppShell'
import { useEffect, useState } from 'react'

const DEFAULT_KYOHAI_URL = 'https://coop-delivery.vercel.app/'

export default function KyohaiPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/inventory').then(r => r.json()).then(d => {
      setUrl(d.settings?.kyohaiUrl || DEFAULT_KYOHAI_URL)
      setLoading(false)
    })
  }, [])

  const box: any = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center' }

  return (
    <AppShell>
      <div style={box}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>共配システム</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.7 }}>
          共同配送の便・スケジュール管理システムです。<br />
          組合が管理し、販売会社と生産者をつなぎます。
        </p>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>読み込み中...</p>
        ) : url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', background: 'var(--accent)', color: '#0f1117', textDecoration: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700 }}>
            共配システムを開く ↗
          </a>
        ) : (
          <p style={{ color: 'var(--warn)', fontSize: 13 }}>
            ⚠️ 共配システムのURLが未設定です。<br />
            <a href="/settings" style={{ color: 'var(--accent)' }}>「設定」</a> から共配システムのURLを登録してください。
          </p>
        )}
      </div>
    </AppShell>
  )
}
