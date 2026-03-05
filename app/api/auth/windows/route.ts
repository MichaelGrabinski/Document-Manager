import { NextRequest, NextResponse } from 'next/server'
import { forwardCookies } from '@/lib/cookies'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

// Windows / Active Directory login via LDAP bind.
// Required env vars:
//   AD_URL=ldap://domain.controller:389
//   AD_BASE_DN=DC=example,DC=local
//   WINDOWS_LOGIN_ENABLED=true
// Optional:
//   AD_USER_PRINCIPAL_SUFFIX=example.local
//   AD_ALLOWED_GROUP_DN=CN=SomeGroup,...
//   AD_GROUP_MAP_ADMIN / AD_GROUP_MAP_EDITOR / AD_GROUP_MAP_VIEWER
export async function POST(req: NextRequest) {
  if (process.env.WINDOWS_LOGIN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Windows login disabled' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: 'Username & password required' }, { status: 400 })
  }

  const { username, password } = body
  const url = process.env.AD_URL
  const baseDN = process.env.AD_BASE_DN
  if (!url || !baseDN) return NextResponse.json({ error: 'AD not configured' }, { status: 500 })

  let ldap: any
  try { ldap = await import('ldapjs') } catch {
    return NextResponse.json({ error: 'ldapjs not installed' }, { status: 500 })
  }

  const principalSuffix = process.env.AD_USER_PRINCIPAL_SUFFIX ||
    baseDN.split(',').map(p => p.replace(/^[A-Z]+=|\s+/ig, '')).join('.')
  const userPrincipal = username.includes('@') ? username : `${username}@${principalSuffix}`

  const client = ldap.createClient({ url, reconnect: false, timeout: 5000, connectTimeout: 5000 })

  // Bind to verify credentials
  const bindResult = await new Promise<{ success: boolean; error?: string }>(resolve => {
    client.bind(userPrincipal, password, (err: any) => {
      if (err) return resolve({ success: false, error: err.message })
      resolve({ success: true })
    })
  })
  if (!bindResult.success) {
    try { client.unbind(() => {}) } catch {}
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Search for group membership to determine roles
  const searchFilter = `(&(objectClass=user)(userPrincipalName=${userPrincipal}))`
  const memberOfDns: string[] = await new Promise(resolve => {
    const groups: string[] = []
    client.search(baseDN, { scope: 'sub', filter: searchFilter, attributes: ['memberOf'], sizeLimit: 2, timeLimit: 5 }, (err: any, res: any) => {
      if (err) return resolve(groups)
      res.on('searchEntry', (entry: any) => {
        const mo = entry.attributes?.find((a: any) => a.type?.toLowerCase() === 'memberof')
        if (mo) (Array.isArray(mo.vals) ? mo.vals : []).forEach((v: any) => { if (typeof v === 'string') groups.push(v) })
      })
      res.on('error', () => resolve(groups))
      res.on('end', () => resolve(groups))
    })
  })
  try { client.unbind(() => {}) } catch {}

  const requiredGroup = process.env.AD_ALLOWED_GROUP_DN
  if (requiredGroup && !memberOfDns.some(g => g.toLowerCase() === requiredGroup.toLowerCase())) {
    return NextResponse.json({ error: 'User not in required group' }, { status: 403 })
  }

  function parseDnList(val?: string) {
    return (val || '').split(',').map(v => v.trim()).filter(Boolean).map(v => v.toLowerCase())
  }
  const lowerGroups = memberOfDns.map(g => g.toLowerCase())
  const rolesSet = new Set<string>()
  if (parseDnList(process.env.AD_GROUP_MAP_ADMIN).some(d => lowerGroups.includes(d))) {
    rolesSet.add('admin'); rolesSet.add('editor'); rolesSet.add('viewer')
  }
  if (parseDnList(process.env.AD_GROUP_MAP_EDITOR).some(d => lowerGroups.includes(d))) {
    rolesSet.add('editor'); rolesSet.add('viewer')
  }
  if (parseDnList(process.env.AD_GROUP_MAP_VIEWER).some(d => lowerGroups.includes(d))) {
    rolesSet.add('viewer')
  }
  if (rolesSet.size === 0) rolesSet.add('viewer')
  const roles = Array.from(rolesSet)

  // Register/update the user in Django and get a session cookie
  try {
    // Ensure user exists in Django (create if needed; ignore 409 conflict = already exists)
    await fetch(`${DJANGO}/file/api/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.toLowerCase(), password: 'ad-managed', is_staff: roles.includes('admin') || roles.includes('editor') }),
    })
  } catch { /* ignore  user may already exist */ }

  const loginResp = await fetch(`${DJANGO}/file/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
    body: JSON.stringify({ username: username.toLowerCase(), password: 'ad-managed' }),
  })
  const loginData = await loginResp.json().catch(() => ({}))
  const res = NextResponse.json({ success: true, user: { name: username.toLowerCase(), roles } })
  forwardCookies(loginResp, res, req)
  return res
}
