import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST() {
  const ck = await cookies()
  ck.set({ name: 'session', value: '', path: '/', maxAge: 0 })
  return NextResponse.json({ success: true })
}
