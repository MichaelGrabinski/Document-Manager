import { NextRequest, NextResponse } from 'next/server'
import { forwardCookies } from '@/lib/cookies'

export const runtime = 'nodejs'

// Local login is replaced by Django auth. Redirect to the main login endpoint.
export async function POST(req: NextRequest) {
  const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'
  try {
    const body = await req.text()
    // Parse username-only body and forward to Django login
    let parsed: any = {}
    try { parsed = JSON.parse(body) } catch {}
    const username = parsed.username || ''
    // Local route historically took just a username (no password). Map to Django
    // by using a placeholder password  callers should use /api/auth/login instead.
    const resp = await fetch(`${DJANGO}/file/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({ username, password: parsed.password || '' }),
    })
    const data = await resp.json().catch(() => ({ error: 'login failed' }))
    const res = NextResponse.json(data, { status: resp.status })
    forwardCookies(resp, res, req)
    return res
  } catch {
    return NextResponse.json({ error: 'Login unavailable' }, { status: 502 })
  }
}
