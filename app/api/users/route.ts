import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

async function proxy(req: NextRequest, method: string, body?: string) {
  const resp = await fetch(`${DJANGO}/file/api/users/`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
    },
    ...(body ? { body } : {}),
  })
  const data = await resp.json().catch(() => [])
  const res = NextResponse.json(data, { status: resp.status })
  resp.headers.getSetCookie?.()?.forEach(c => res.headers.append('set-cookie', c))
  return res
}

export async function GET(req: NextRequest) {
  return proxy(req, 'GET')
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  return proxy(req, 'POST', body)
}

export async function DELETE(req: NextRequest) {
  const body = await req.text()
  return proxy(req, 'DELETE', body)
}
