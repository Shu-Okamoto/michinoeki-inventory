import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { authenticateCredentials, resolveRoleByEmail } from '@/lib/users'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    CredentialsProvider({
      name: 'ID/パスワード',
      credentials: {
        loginId: { label: 'ログインID', type: 'text' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) return null
        const u = await authenticateCredentials(credentials.loginId, credentials.password)
        if (!u) return null
        return { id: u.id, name: u.name, role: u.role, loginId: u.loginId } as any
      },
    }),
  ],
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account, user }) {
      // ID/パスワードログイン
      if (account?.provider === 'credentials' && user) {
        token.role = (user as any).role
        token.name = (user as any).name
        token.loginId = (user as any).loginId
      }
      // Googleログイン（Gmail連携用トークン＋ロール解決）
      if (account?.provider === 'google') {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        const r = await resolveRoleByEmail(token.email as string)
        token.role = r.role
        if (r.name) token.name = r.name
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.refreshToken = token.refreshToken as string
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).loginId = token.loginId
        if (token.name) session.user.name = token.name as string
      }
      return session
    },
  },
  pages: { signIn: '/' },
}
