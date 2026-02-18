import crypto from 'crypto'

const ALG = 'aes-256-gcm'

export function encryptJSON(obj: any, secret: string): string {
  const iv = crypto.randomBytes(12)
  const key = crypto.createHash('sha256').update(secret).digest()
  const cipher = crypto.createCipheriv(ALG, key, iv)
  const plaintext = Buffer.from(JSON.stringify(obj))
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptJSON(blob: string, secret: string): any {
  try {
    const raw = Buffer.from(blob, 'base64')
    const iv = raw.subarray(0,12)
    const tag = raw.subarray(12,28)
    const data = raw.subarray(28)
    const key = crypto.createHash('sha256').update(secret).digest()
    const decipher = crypto.createDecipheriv(ALG, key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    return JSON.parse(dec)
  } catch { return null }
}
