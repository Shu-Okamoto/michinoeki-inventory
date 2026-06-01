import { NextRequest, NextResponse } from 'next/server'
import { maybeSendScheduled } from '@/lib/salesmail'

// Vercel Cron から定期実行される。CRON_SECRET が設定されていれば検証する。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const key = new URL(req.url).searchParams.get('key')
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const result = await maybeSendScheduled()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 })
  }
}
