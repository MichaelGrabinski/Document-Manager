import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

async function proxy(req: NextRequest, method: string, body?: string) {
  const resp = await fetch(`${DJANGO}/file/api/documents/`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
    },
    ...(body ? { body } : {}),
  })
  const data = await resp.json().catch(() => method === 'GET' ? [] : {})
  const res = NextResponse.json(data, { status: resp.status })
  resp.headers.getSetCookie?.()?.forEach(c => res.headers.append('set-cookie', c))
  return res
}

export async function GET(req: NextRequest) { return proxy(req, 'GET') }
export async function POST(req: NextRequest) { return proxy(req, 'POST', await req.text()) }
export async function DELETE(req: NextRequest) { return proxy(req, 'DELETE', await req.text()) }
