import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJwt } from '@/lib/jwt'
import { cookies } from 'next/headers'

// Simple local/dev login issuing a session cookie. Not for production use.
// POST { username: string }
// Optionally supply roles override (array) when already admin.
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (process.env.LOCAL_LOGIN_DISABLED === 'true') {
    return NextResponse.json({ error: 'Local login disabled' }, { status: 403 })
  }
  const body = await req.json().catch(()=>null) as { username?: string; roles?: string[] }
  const username = body?.username?.trim()
  if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 })
  const lower = username.toLowerCase()
  // Simple heuristic roles if not provided: names containing admin/editor
  let roles: string[] = Array.isArray(body?.roles) && body.roles.length>0 ? body.roles : ( lower.includes('admin') ? ['admin','editor','viewer'] : lower.includes('editor') ? ['editor','viewer'] : ['viewer'] )
  // Ensure role inheritance consistency
  if (roles.includes('admin') && !roles.includes('editor')) roles.push('editor')
  if ((roles.includes('admin')||roles.includes('editor')) && !roles.includes('viewer')) roles.push('viewer')
  roles = Array.from(new Set(roles))

  const user = await prisma.user.upsert({
    where: { name: lower },
    update: { roles: JSON.stringify(roles) },
    create: { name: lower, roles: JSON.stringify(roles) }
  })

  const secret = process.env.JWT_SECRET || 'dev-secret-change'
  const token = signJwt({ sub: user.id, name: user.name, roles }, secret, 3600)
  const ck = await cookies()
  ck.set({ name: 'session', value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600, secure: process.env.NODE_ENV === 'production' })
  return NextResponse.json({ success: true, user: { name: user.name, roles }, token })
}
