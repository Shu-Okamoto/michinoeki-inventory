import crypto from 'crypto'
import { kvGet } from './db'

// 全ロールが同じデータを共有する組合単位の領域キー
export const ORG = 'org:iwakuni'

export type Role = '生産者' | '販売者' | '組合管理者' | '組合パートナー' | 'admin'
export type View = 'producer' | 'seller' | 'admin' | 'partner' | 'guest'

// ロール判定ヘルパー
export function isAdminRole(role?: string): boolean { return role === 'admin' }
export function isPartnerRole(role?: string): boolean { return role === '組合パートナー' || role === '組合管理者' }
export function hasOperationalAccess(role?: string): boolean { return isAdminRole(role) || isPartnerRole(role) }

export interface MasterUser {
  id: string
  name: string
  role: Role
  disabled?: boolean
  company?: string
  email?: string
  phone?: string
  note?: string
  loginId?: string
  passwordHash?: string
}

// パスワードを salt:hash 形式へ
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const h = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${h}`
}

export function verifyPassword(pw: string, stored?: string): boolean {
  if (!stored || !stored.includes(':')) return false
  const [salt, h] = stored.split(':')
  const hh = crypto.scryptSync(pw, salt, 64).toString('hex')
  const a = Buffer.from(h, 'hex')
  const b = Buffer.from(hh, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function roleToView(role?: string): View {
  if (role === 'admin') return 'admin'
  if (role === '組合パートナー' || role === '組合管理者') return 'partner'
  if (role === '販売者') return 'seller'
  if (role === '生産者') return 'producer'
  return 'guest'
}

export async function getUsers(): Promise<MasterUser[]> {
  return (await kvGet<MasterUser[]>(ORG, 'producers')) || []
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)
}

// ID/パスワードでの認証
export async function authenticateCredentials(loginId: string, password: string) {
  // 環境変数による初期管理者（マスタが空でもログイン可能・ブートストラップ用）
  const bootId = process.env.BOOTSTRAP_ADMIN_ID
  const bootPw = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (bootId && bootPw && loginId === bootId && password === bootPw) {
    return { id: 'bootstrap-admin', name: 'admin', role: 'admin' as Role, loginId: bootId }
  }
  const users = await getUsers()
  const u = users.find(x => x.loginId && x.loginId === loginId)
  if (!u || !verifyPassword(password, u.passwordHash)) return null
  if (u.disabled) return null
  return { id: u.id, name: u.name, role: (u.role || '生産者') as Role, loginId: u.loginId }
}

// Googleログインのメールからロールを解決
export async function resolveRoleByEmail(email?: string | null): Promise<{ role: Role | 'guest'; name?: string }> {
  if (!email) return { role: 'guest' }
  const admins = adminEmails()
  if (admins.includes(email)) return { role: 'admin', name: email }
  const users = await getUsers()
  const hit = users.find(u => u.email && u.email === email)
  if (hit) return hit.disabled ? { role: 'guest', name: hit.name } : { role: (hit.role || '生産者') as Role, name: hit.name }
  // ブートストラップ: 管理者がまだ一人も定義されていなければ最初のGoogleログインをadminに
  const hasAdmin = admins.length > 0 || users.some(u => u.role === 'admin' || u.role === '組合管理者')
  if (!hasAdmin) return { role: 'admin', name: email }
  return { role: 'guest', name: email }
}
