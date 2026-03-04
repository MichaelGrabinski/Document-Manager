import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Auto Windows SSO: not currently configured via Django.
// Return a clean "not enabled" so the frontend skips SSO without a console error.
export async function GET(_req: NextRequest) {
  return NextResponse.json({ enabled: false, success: false, reason: 'auto-login not configured' })
}
