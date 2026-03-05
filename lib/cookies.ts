import { NextRequest, NextResponse } from 'next/server'

/**
 * Forward Set-Cookie headers from a Django response to a Next.js response.
 * If the original request arrived over HTTPS (X-Forwarded-Proto or url scheme),
 * ensure each cookie carries the Secure flag so browsers actually store it.
 */
export function forwardCookies(
  djangoResp: Response,
  nextRes: NextResponse,
  incomingReq?: NextRequest,
) {
  const isHttps =
    incomingReq?.headers.get('x-forwarded-proto') === 'https' ||
    incomingReq?.nextUrl?.protocol === 'https:'

  djangoResp.headers.getSetCookie?.()?.forEach((cookie) => {
    let patched = cookie
    if (isHttps && !/;\s*Secure/i.test(cookie)) {
      patched = cookie + '; Secure'
    }
    nextRes.headers.append('set-cookie', patched)
  })
}
