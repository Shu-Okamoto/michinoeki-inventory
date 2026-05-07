'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import styles from './shell.module.css'

const NAV = [
  { href: '/dashboard', label: '📊 在庫状況' },
  { href: '/send',      label: '📦 出荷登録' },
  { href: '/email',     label: '✉️ Gmail連携' },
  { href: '/history',   label: '📋 販売履歴' },
  { href: '/settings',  label: '⚙️ 設定' },
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
            <div className={styles.logoText}>道の駅 在庫管理</div>
            <div className={styles.logoSub}>INVENTORY SYSTEM</div>
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
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.navItem} ${pathname === href ? styles.active : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
