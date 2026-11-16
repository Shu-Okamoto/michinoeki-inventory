'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './shell.module.css'

const ITEMS = {
  news:      { href: '/news',      label: '📢 お知らせ' },
  deals:     { href: '/deals',     label: '🤝 取引（産直/卸売）' },
  settlement:{ href: '/settlement',label: '🧮 月末締め・請求書' },
  send:      { href: '/send',      label: '📦 納品入力' },
  dashboard: { href: '/dashboard', label: '📊 在庫・納品状況' },
  kyohai:    { href: '/kyohai',    label: '🚚 共配システム' },
  master:    { href: '/master',    label: '🌱 商品・道の駅 登録' },
  producers: { href: '/producers', label: '👤 ユーザーマスタ' },
  sales:     { href: '/sales',     label: '🧾 売上入力' },
  email:     { href: '/email',     label: '✉️ Gmail連携' },
  history:   { href: '/history',   label: '📋 履歴' },
  analysis:  { href: '/shipment-analysis', label: '📊 出荷分析' },
  tools:     { href: '/tools',     label: '📦 在庫管理ツール' },
  myInvoices:{ href: '/my-invoices', label: '🧾 自分の請求書' },
  settings:  { href: '/settings',  label: '⚙️ 設定' },
}

export type View = 'admin' | 'partner' | 'seller' | 'producer' | 'guest'

export function roleToView(role?: string): View {
  if (role === 'admin') return 'admin'
  if (role === '組合パートナー' || role === '組合管理者') return 'partner'
  if (role === '販売者') return 'seller'
  if (role === '生産者') return 'producer'
  return 'guest'
}

const VIEW_LABEL: Record<View, string> = {
  admin: '管理者ビュー', partner: '組合パートナービュー', seller: '販売会社ビュー', producer: '生産者ビュー', guest: '—',
}

// 在庫管理ツールの中身（/tools のボタン遷移先）。メニューには出さない。
export function toolsForView(view: View) {
  if (view === 'admin' || view === 'partner') return [ITEMS.dashboard, ITEMS.send, ITEMS.sales, ITEMS.history, ITEMS.email]
  if (view === 'seller') return [ITEMS.sales, ITEMS.history]
  if (view === 'producer') return [ITEMS.dashboard, ITEMS.send, ITEMS.sales, ITEMS.history]
  return []
}

function groupsForView(view: View) {
  // 表示順: お知らせ / ワークフロー / 共配システム / 在庫管理ツール / 管理
  if (view === 'admin') return [
    { title: 'お知らせ', items: [ITEMS.news] },
    { title: '🤝 産直・卸売 ワークフロー', items: [ITEMS.deals, ITEMS.settlement, ITEMS.analysis] },
    { title: '🚚 共配システム', items: [ITEMS.kyohai] },
    { title: '📦 在庫管理', items: [ITEMS.tools] },
    { title: '⚙️ 管理', items: [ITEMS.producers, ITEMS.settings] },
  ]
  if (view === 'partner') return [
    { title: 'お知らせ', items: [ITEMS.news] },
    { title: '🤝 産直・卸売 ワークフロー', items: [ITEMS.deals, ITEMS.analysis] },
    { title: '🚚 共配システム', items: [ITEMS.kyohai] },
    { title: '📦 在庫管理', items: [ITEMS.tools] },
    { title: '⚙️ マスタ登録', items: [ITEMS.master] },
  ]
  if (view === 'seller') return [
    { title: 'お知らせ', items: [ITEMS.news] },
    { title: '🤝 産直・卸売 ワークフロー', items: [ITEMS.deals, ITEMS.myInvoices] },
    { title: '📦 在庫管理', items: [ITEMS.tools] },
    { title: '⚙️ マスタ登録', items: [ITEMS.master] },
  ]
  if (view === 'producer') return [
    { title: 'お知らせ', items: [ITEMS.news] },
    { title: '🤝 産直・卸売 ワークフロー', items: [ITEMS.deals, ITEMS.analysis, ITEMS.myInvoices] },
    { title: '🚚 共配システム', items: [ITEMS.kyohai] },
    { title: '📦 在庫管理', items: [ITEMS.tools] },
    { title: '⚙️ マスタ登録', items: [ITEMS.master] },
  ]
  return []
}

// ヘッダーに出す現在のページ名
function currentLabel(pathname: string): string {
  const hit = Object.values(ITEMS).find(i => i.href === pathname)
  return hit ? hit.label : ''
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [logoOk, setLogoOk] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  // ページが変わったらメニューを閉じる
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // メニューを開いている間はEscapeで閉じ、背面のスクロールを止める
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [menuOpen])

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
          {view !== 'guest' && (
            <button className={styles.menuBtn} onClick={() => setMenuOpen(true)} aria-label="メニューを開く" aria-expanded={menuOpen}>
              <span className={styles.menuBtnIcon}>☰</span>メニュー
            </button>
          )}
          {logoOk
            ? <img src="/logo.png" alt="いわくにアグリパートナーズ" className={styles.logoImg} onError={() => setLogoOk(false)} />
            : <div className={styles.logoIcon}>🌾</div>}
          <div>
            <div className={styles.logoText}>いわくにアグリパートナーズ 組合ポータル</div>
            <div className={styles.logoSub}>IWAKUNI AGRI PARTNERS</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {view !== 'guest' && <span className={styles.currentPage}>{currentLabel(pathname)}</span>}
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
          {menuOpen && (
            <>
              <div className={styles.overlay} onClick={() => setMenuOpen(false)} />
              <nav className={styles.drawer} aria-label="メニュー">
                <div className={styles.drawerHead}>
                  <span className={styles.drawerTitle}>メニュー</span>
                  <button className={styles.drawerClose} onClick={() => setMenuOpen(false)} aria-label="閉じる">×</button>
                </div>
                <div className={styles.drawerBody}>
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
                </div>
              </nav>
            </>
          )}
          <main className={styles.main}>{children}</main>
        </>
      )}
    </div>
  )
}
