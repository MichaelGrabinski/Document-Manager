import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJwt } from '@/lib/jwt'
import { cookies } from 'next/headers'

// Auto Windows SSO header-based login.
// Requires reverse proxy (IIS / Nginx / Apache) to perform Integrated Windows Auth
// and forward a trusted header (e.g. X-Remote-User) containing DOMAIN\\username or username.
// Enable by setting AUTO_WINDOWS_HEADER_ENABLED=true.

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (process.env.AUTO_WINDOWS_HEADER_ENABLED !== 'true') {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  // Common header variations that a reverse proxy might set after Integrated Windows Auth.
  const headerKeys = ['x-remote-user','x-iwa-user','x-forwarded-user','remote-user']
  let raw: string | null = null
  for (const k of headerKeys) {
    const v = req.headers.get(k)
    if (v) { raw = v; break }
  }
  if (!raw) return NextResponse.json({ success: false, reason: 'header-missing' }, { status: 401 })

  // Normalize DOMAIN\\user or user@domain -> user
  let username = raw.trim()
  if (username.includes('\\')) username = username.split('\\').pop() || username
  if (username.includes('@')) username = username.split('@')[0]
  username = username.toLowerCase()
  if (!username.match(/^[a-z0-9._-]{1,64}$/i)) {
    return NextResponse.json({ success: false, reason: 'invalid-format' }, { status: 400 })
  }

  // Minimal default role if nothing else provisioned.
  const defaultRoles = ['viewer']
  const existing = await prisma.user.findUnique({ where: { name: username } })
  let roles: string[] = defaultRoles
  if (existing) {
    try { roles = JSON.parse(existing.roles) } catch { roles = defaultRoles }
  }

  const user = await prisma.user.upsert({
    where: { name: username },
    update: {},
    create: { name: username, roles: JSON.stringify(roles) }
  })

  // Issue the same JWT session cookie used by the manual Windows login so the session survives refresh.
  const secret = process.env.JWT_SECRET || 'dev-secret-change'
  const token = signJwt({ sub: user.id, name: user.name, roles }, secret, 3600)
  const ck = await cookies()
  ck.set({ name: 'session', value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600, secure: process.env.NODE_ENV === 'production' })

  return NextResponse.json({ success: true, user: { name: user.name, roles }, token, method: 'auto-header' })
}