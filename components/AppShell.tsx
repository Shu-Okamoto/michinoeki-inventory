'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './shell.module.css'

const ITEMS = {
  news:      { href: '/news',      label: '📢 お知らせ' },
  deals:     { href: '/deals',     label: '🤝 取引（産直/卸売）' },
  send:      { href: '/send',      label: '📦 みかわ納品数入力' },
  dashboard: { href: '/dashboard', label: '📊 在庫・納品状況' },
  kyohai:    { href: '/kyohai',    label: '🚚 共配システム' },
  producers: { href: '/producers', label: '👤 ユーザーマスタ' },
  sales:     { href: '/sales',     label: '🧾 レジ通過数入力' },
  email:     { href: '/email',     label: '✉️ Gmail連携' },
  history:   { href: '/history',   label: '📋 販売履歴・売上明細' },
  settings:  { href: '/settings',  label: '⚙️ 設定' },
}

type View = 'admin' | 'seller' | 'producer' | 'guest'

function roleToView(role?: string): View {
  if (role === '組合管理者') return 'admin'
  if (role === '販売者') return 'seller'
  if (role === '生産者') return 'producer'
  return 'guest'
}

const VIEW_LABEL: Record<View, string> = {
  admin: '全体ビュー', seller: '販売会社ビュー', producer: '生産者ビュー', guest: '—',
}

function groupsForView(view: View) {
  if (view === 'admin') return [
    { title: '産直/卸売ワークフロー', items: [ITEMS.deals] },
    { title: '生産者ポータル', items: [ITEMS.news, ITEMS.send, ITEMS.dashboard, ITEMS.kyohai] },
    { title: '組合管理（アグリパートナーズ）', items: [ITEMS.producers, ITEMS.sales, ITEMS.history, ITEMS.email, ITEMS.settings] },
  ]
  if (view === 'seller') return [
    { title: '販売会社ビュー', items: [ITEMS.news, ITEMS.deals, ITEMS.sales, ITEMS.history] },
  ]
  if (view === 'producer') return [
    { title: '生産者ビュー', items: [ITEMS.news, ITEMS.deals, ITEMS.send, ITEMS.dashboard, ITEMS.kyohai] },
  ]
  return []
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  if (status === 'loading' || !session) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className={styles.spinner} />
    </div>
  )

  const role = (session.user as any)?.role as string | undefined
  const view = roleToView(role)
  const groups = groupsForView(view)
  const identity = session.user?.email || (session.user as any)?.loginId || session.user?.name || ''

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          {logoOk
            ? <img src="/logo.png" alt="いわくにアグリパートナーズ" className={styles.logoImg} onError={() => setLogoOk(false)} />
            : <div className={styles.logoIcon}>🌾</div>}
          <div>
            <div className={styles.logoText}>いわくにアグリパートナーズ 産直ポータル</div>
            <div className={styles.logoSub}>IWAKUNI AGRI PARTNERS</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {view !== 'guest' && <span className={styles.viewBadge}>{VIEW_LABEL[view]}</span>}
          <span className={styles.userEmail}>{session.user?.name || identity}</span>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/' })}>
            ログアウト
          </button>
        </div>
      </header>

      {view === 'guest' ? (
        <main className={styles.main}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>アクセス権限がありません</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              このアカウント（{identity}）にはまだ区分が割り当てられていません。<br />
              組合管理者にユーザー登録を依頼してください。
            </p>
          </div>
        </main>
      ) : (
        <>
          <nav className={styles.nav}>
            {groups.map(group => (
              <div key={group.title} className={styles.navGroup}>
                <span className={styles.navGroupTitle}>{group.title}</span>
                <div className={styles.navGroupItems}>
                  {group.items.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className={`${styles.navItem} ${pathname === href ? styles.active : ''}`}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <main className={styles.main}>{children}</main>
        </>
      )}
    </div>
  )
}
