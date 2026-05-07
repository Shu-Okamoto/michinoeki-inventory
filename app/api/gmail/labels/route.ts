import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: session.accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const res = await gmail.users.labels.list({ userId: 'me' })
  const labels = (res.data.labels || [])
    .filter(l => l.type === 'user' || ['INBOX','STARRED','SENT'].includes(l.id || ''))
    .map(l => ({ id: l.id, name: l.name }))

  return NextResponse.json({ labels })
}
