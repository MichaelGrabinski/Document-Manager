import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const resp = await fetch(`${DJANGO}/file/api/auth/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body,
    })
    const data = await resp.json().catch(() => ({}))
    const res = NextResponse.json(data, { status: resp.status })
    // Forward the Django session cookie to the browser
    resp.headers.getSetCookie?.()?.forEach(c => res.headers.append('set-cookie', c))
    return res
  } catch (e) {
    console.error('proxy login error', e)
    return NextResponse.json({ error: 'Login unavailable' }, { status: 502 })
  }
}
