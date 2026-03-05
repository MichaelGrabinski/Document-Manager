import { NextRequest, NextResponse } from 'next/server'
import { forwardCookies } from '@/lib/cookies'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

export async function POST(req: NextRequest) {
  try {
    const resp = await fetch(`${DJANGO}/file/api/auth/logout/`, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    const data = await resp.json().catch(() => ({ success: true }))
    const res = NextResponse.json(data, { status: resp.status })
    forwardCookies(resp, res, req)
    return res
  } catch {
    return NextResponse.json({ success: true })
  }
}
