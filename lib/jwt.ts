import crypto from 'crypto'

const textEncoder = new TextEncoder()

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf.toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')
}

export function signJwt(payload: Record<string, any>, secret: string, expiresInSec = 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now()/1000)
  const body = { ...payload, iat: now, exp: now + expiresInSec }
  const headerPart = b64url(JSON.stringify(header))
  const bodyPart = b64url(JSON.stringify(body))
  const data = `${headerPart}.${bodyPart}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

export function verifyJwt(token: string, secret: string): { valid: boolean; payload?: any; reason?: string } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { valid: false, reason: 'format' }
    const [h, b, s] = parts
    const data = `${h}.${b}`
    const expected = b64url(crypto.createHmac('sha256', secret).update(data).digest())
    if (expected !== s) return { valid: false, reason: 'sig' }
    const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8'))
    if (payload.exp && Date.now()/1000 > payload.exp) return { valid: false, reason: 'exp' }
    return { valid: true, payload }
  } catch (e:any) {
    return { valid: false, reason: 'error' }
  }
}
