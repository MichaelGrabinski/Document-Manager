import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { signJwt } from '@/lib/jwt'
import { cookies } from 'next/headers'

// Windows / Active Directory login via LDAP bind.
// Environment variables required:
// AD_URL=ldap://domain.controller:389 (or ldaps://...:636)
// AD_BASE_DN=DC=example,DC=local
// AD_DOMAIN_SHORT=EXAMPLE (NetBIOS) optional; if present and username has no @, userPrincipalName formed as `${username}@${AD_USER_PRINCIPAL_SUFFIX}` or `${username}@example.local`
// AD_USER_PRINCIPAL_SUFFIX=example.local (optional; fallback derive from BASE_DN)
// AD_ALLOWED_GROUP_DN=CN=SomeGroup,OU=Groups,DC=example,DC=local (optional filter)
// Role mapping (optional):
// AD_GROUP_MAP_ADMIN=CN=ADMINS,OU=Groups,DC=example,DC=local[,CN=OTHER_ADMIN,...]
// AD_GROUP_MAP_EDITOR=CN=EDITORS,OU=Groups,DC=example,DC=local[,CN=OTHER_EDITOR,...]
// AD_GROUP_MAP_VIEWER=CN=VIEWERS,OU=Groups,DC=example,DC=local[,CN=OTHER_VIEWER,...]
// WINDOWS_LOGIN_ENABLED=true must be set to enable endpoint.
// NOTE: This runs server-side only.

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (process.env.WINDOWS_LOGIN_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Windows login disabled' }, { status: 403 })
  }
  const body = await req.json().catch(()=>null) as { username?: string; password?: string; refresh?: boolean }
  if (!body?.username || (!body?.password && !body?.refresh)) return NextResponse.json({ error: 'Username & password required' }, { status: 400 })

  const { username, password } = body
  const url = process.env.AD_URL
  const baseDN = process.env.AD_BASE_DN
  if (!url || !baseDN) return NextResponse.json({ error: 'AD not configured' }, { status: 500 })

  // Lazy import ldapjs only when route hit (keeps edge bundle small if unused)
  let ldap: any
  try { ldap = await import('ldapjs') } catch (e) { return NextResponse.json({ error: 'ldapjs not installed on server' }, { status: 500 }) }

  const client = ldap.createClient({ url, reconnect: false, timeout: 5000, connectTimeout: 5000 })

  const principalSuffix = process.env.AD_USER_PRINCIPAL_SUFFIX || baseDN.split(',').map(p=>p.replace(/^[A-Z]+=|\s+/ig,'')).join('.')
  const userPrincipal = username.includes('@') ? username : `${username}@${principalSuffix}`

  if (!body.refresh) {
    const bindResult = await new Promise<{ success: boolean; error?: string }>(resolve => {
      client.bind(userPrincipal, password, (err: any) => {
        if (err) return resolve({ success: false, error: err.message })
        resolve({ success: true })
      })
    })
    if (!bindResult.success) {
      try { client.unbind(()=>{}) } catch {}
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
  } else {
    // For refresh, attempt an anonymous or service bind if configured
    const svcUser = process.env.AD_SERVICE_USER
    const svcPass = process.env.AD_SERVICE_PASS
    if (svcUser && svcPass) {
      const bindRes = await new Promise<{ success: boolean }>(resolve => {
        client.bind(svcUser, svcPass, (err:any) => resolve({ success: !err }))
      })
      if (!bindRes.success) {
        try { client.unbind(()=>{}) } catch {}
        return NextResponse.json({ error: 'Service bind failed' }, { status: 500 })
      }
    }
  }

  // Single directory search to retrieve memberOf; then enforce required group and map roles
  const searchFilter = `(&(objectClass=user)(userPrincipalName=${userPrincipal}))`
  const searchOpts = { scope: 'sub', filter: searchFilter, attributes: ['memberOf'], sizeLimit: 2, timeLimit: 5 }
  const memberOfDns: string[] = await new Promise(resolve => {
    const groups: string[] = []
    client.search(baseDN, searchOpts, (err: any, res: any) => {
      if (err) return resolve(groups)
      res.on('searchEntry', (entry: any) => {
        const mo = entry.attributes?.find((a: any) => a.type?.toLowerCase() === 'memberof')
        if (mo) {
          const vals = Array.isArray(mo.vals) ? mo.vals : []
          vals.forEach((v: any) => { if (typeof v === 'string') groups.push(v) })
        }
      })
      res.on('error', () => resolve(groups))
      res.on('end', () => resolve(groups))
    })
  })

  const requiredGroup = process.env.AD_ALLOWED_GROUP_DN
  if (requiredGroup && !memberOfDns.some(g => g.toLowerCase() === requiredGroup.toLowerCase())) {
    try { client.unbind(()=>{}) } catch {}
    return NextResponse.json({ error: 'User not in required group' }, { status: 403 })
  }

  // Map groups -> roles
  function parseDnList(val?: string) {
    return (val||'').split(',').map(v=>v.trim()).filter(Boolean).map(v=>v.toLowerCase())
  }
  const adminDns = parseDnList(process.env.AD_GROUP_MAP_ADMIN)
  const editorDns = parseDnList(process.env.AD_GROUP_MAP_EDITOR)
  const viewerDns = parseDnList(process.env.AD_GROUP_MAP_VIEWER)
  const lowerGroups = memberOfDns.map(g=>g.toLowerCase())
  const rolesSet = new Set<string>()
  if (adminDns.some(d=>lowerGroups.includes(d))) {
    rolesSet.add('admin'); rolesSet.add('editor'); rolesSet.add('viewer')
  }
  if (editorDns.some(d=>lowerGroups.includes(d))) {
    rolesSet.add('editor'); rolesSet.add('viewer')
  }
  if (viewerDns.some(d=>lowerGroups.includes(d))) {
    rolesSet.add('viewer')
  }
  if (rolesSet.size === 0) rolesSet.add('viewer') // default minimal access
  const roles = Array.from(rolesSet)

  try { client.unbind(()=>{}) } catch {}

  const localName = username.toLowerCase()
  const user = await prisma.user.upsert({
    where: { name: localName },
    update: { roles: JSON.stringify(roles) },
    create: { name: localName, roles: JSON.stringify(roles) }
  })
  const secret = process.env.JWT_SECRET || 'dev-secret-change'
  const token = signJwt({ sub: user.id, name: user.name, roles }, secret, 3600)
  try { client.unbind(()=>{}) } catch {}
  const ck = await cookies()
  ck.set({ name: 'session', value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600, secure: process.env.NODE_ENV === 'production' })
  return NextResponse.json({ success: true, user: { ...user, roles }, token })
}