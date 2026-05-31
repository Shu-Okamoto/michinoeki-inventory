'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import styles from './shell.module.css'

const NAV_GROUPS = [
  {
    title: '生産者ポータル',
    items: [
      { href: '/news',      label: '📢 お知らせ' },
      { href: '/send',      label: '📦 納品数入力' },
      { href: '/dashboard', label: '📊 在庫・納品状況' },
    ],
  },
  {
    title: 'みかわ管理',
    items: [
      { href: '/producers', label: '👤 組合員マスタ' },
      { href: '/sales',     label: '✏️ 売上入力' },
      { href: '/email',     label: '✉️ Gmail連携' },
      { href: '/history',   label: '📋 販売履歴' },
      { href: '/settings',  label: '⚙️ 設定' },
    ],
  },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  if (status === 'loading' || !session) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div className={styles.spinner} />
    </div>
  )

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🌿</div>
          <div>
            <div className={styles.logoText}>みかわ 産直ポータル</div>
            <div className={styles.logoSub}>MIKAWA PORTAL</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{session.user?.email}</span>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/' })}>
            ログアウト
          </button>
        </div>
      </header>

      <nav className={styles.nav}>
        {NAV_GROUPS.map(group => (
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
    </div>
  )
}
