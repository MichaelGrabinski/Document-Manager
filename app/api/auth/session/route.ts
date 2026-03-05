import { NextRequest, NextResponse } from 'next/server'
import { forwardCookies } from '@/lib/cookies'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

export async function GET(req: NextRequest) {
  try {
    const resp = await fetch(`${DJANGO}/file/api/auth/session/`, {
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    const data = await resp.json()
    const res = NextResponse.json(data, { status: resp.status })
    // Forward any Set-Cookie from Django (session cookie)
    forwardCookies(resp, res, req)
    return res
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
