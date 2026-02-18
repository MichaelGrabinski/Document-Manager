import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt, signJwt } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const secret = process.env.JWT_SECRET || 'dev-secret-change'
  const ck = await cookies()
  const token = ck.get('session')?.value
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 })
  const ver = verifyJwt(token, secret)
  if (!ver.valid) return NextResponse.json({ authenticated: false, reason: ver.reason }, { status: 401 })
  const userId = ver.payload.sub
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 })
  // Optionally refresh exp
  const newToken = signJwt({ sub: user.id, name: user.name, roles: JSON.parse(user.roles) }, secret, 3600)
  ck.set({ name: 'session', value: newToken, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600, secure: process.env.NODE_ENV === 'production' })
  return NextResponse.json({ authenticated: true, user: { name: user.name, roles: JSON.parse(user.roles) } })
}
