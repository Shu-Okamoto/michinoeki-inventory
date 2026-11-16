'use client'
import AppShell, { toolsForView, roleToView } from '@/components/AppShell'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

// 在庫管理ツールの入口。各ツールへはボタンで別画面に遷移する。
const DESC: Record<string, string> = {
  '/dashboard': '道の駅ごとの在庫・納品状況を確認します',
  '/send': '道の駅へ納品した数量を登録します',
  '/sales': '納品したものから、売れた数（レジ通過数）を登録します',
  '/history': '売上の履歴を月ごと・納品先ごとに確認します',
  '/email': 'Gmailから売上メールを取り込みます',
}

export default function ToolsPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const items = toolsForView(roleToView(role))

  return (
    <AppShell>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>📦 在庫管理ツール</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>使いたいツールを選んでください。</p>

      {items.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          利用できるツールがありません。
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {items.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'block', textDecoration: 'none',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '18px 20px', color: 'var(--text)',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{DESC[href] || ''}</div>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, marginTop: 10 }}>開く →</div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
