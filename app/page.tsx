'use client'
import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  if (status === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:'16px' }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <p style={{ color:'var(--muted)', fontSize:14 }}>読み込み中...</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', flexDirection:'column', gap:'32px', padding:'24px'
    }}>
      <div style={{ textAlign:'center' }}>
        {logoOk
          ? <img src="/logo.png" alt="いわくにアグリパートナーズ" onError={() => setLogoOk(false)}
              style={{ width:96, height:96, objectFit:'contain', margin:'0 auto 20px', display:'block' }} />
          : <div style={{
              width:72, height:72, background:'linear-gradient(135deg,#5DA63E,#2BA6C4)',
              borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:36, margin:'0 auto 20px', boxShadow:'0 4px 16px rgba(61,58,52,.12)'
            }}>🌾</div>}
        <h1 style={{ fontSize:26, fontWeight:700, marginBottom:8 }}>いわくにアグリパートナーズ</h1>
        <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.7 }}>
          産直ポータル<br />生産者・販売会社・組合をつなぐ納品管理
        </p>
      </div>

      <button
        onClick={() => signIn('google')}
        style={{
          display:'flex', alignItems:'center', gap:12,
          background:'var(--surface)', color:'var(--text)', border:'1px solid var(--border)',
          borderRadius:12, padding:'14px 28px', fontSize:15, fontWeight:600,
          boxShadow:'0 4px 20px rgba(61,58,52,0.12)', transition:'transform 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
      >
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
          <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
        </svg>
        Googleアカウントでログイン
      </button>

      <p style={{ color:'var(--muted)', fontSize:12 }}>
        Gmailの読み取り権限を使用します
      </p>
    </div>
  )
}
