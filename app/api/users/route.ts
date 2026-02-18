import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { encryptJSON, decryptJSON } from '@/lib/crypto'

const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(64),
  roles: z.array(z.string().min(1)).default([]),
})

function toClient(u: any) {
  let rolesArr = parseArray(u.roles)
  if ((!rolesArr || rolesArr.length===0) && u.rolesEncrypted) {
    const dec = decryptJSON(u.rolesEncrypted, process.env.ROLES_SECRET || 'dev-roles')
    if (Array.isArray(dec)) rolesArr = dec
  }
  return { ...u, roles: rolesArr }
}
function parseArray(v: any) { if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p)?p:[] } catch {} } return [] }
function fromClient(p: any) {
  const rolesArray = Array.isArray(p.roles)?p.roles:[]
  return { ...p, roles: JSON.stringify(rolesArray), rolesEncrypted: encryptJSON(rolesArray, process.env.ROLES_SECRET || 'dev-roles') }
}

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  if (users.length === 0) {
    const admin = await prisma.user.create({ data: { name: 'admin', roles: JSON.stringify(['admin','editor','viewer']) } })
    return NextResponse.json([toClient(admin)])
  }
  return NextResponse.json(users.map(toClient))
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json()
    const parsed = userSchema.parse(json)
    let user
    const actor = 'system' // could be extracted from session later
    const before = parsed.id ? await prisma.user.findUnique({ where: { id: parsed.id } }) : await prisma.user.findUnique({ where: { name: parsed.name } })
    if (parsed.id) {
      const existing = await prisma.user.findUnique({ where: { id: parsed.id } })
      if (existing) {
        user = await prisma.user.update({ where: { id: parsed.id }, data: fromClient(parsed) })
      } else {
        user = await prisma.user.create({ data: fromClient(parsed) })
      }
    } else {
      // upsert by name
      const existingByName = await prisma.user.findUnique({ where: { name: parsed.name } })
      if (existingByName) {
        user = await prisma.user.update({ where: { name: parsed.name }, data: fromClient(parsed) })
      } else {
        user = await prisma.user.create({ data: fromClient(parsed) })
      }
    }
    const afterRoles = parseArray(user.roles)
    const beforeRoles = before ? parseArray(before.roles) : []
    if (JSON.stringify(afterRoles) !== JSON.stringify(beforeRoles)) {
      await prisma.auditLog.create({ data: { actor, action: 'roles.change', target: user.name, details: JSON.stringify({ before: beforeRoles, after: afterRoles }) } }).catch(()=>{})
    }
    return NextResponse.json({ success: true, user: toClient(user) })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues.map(i=>i.message).join(', ') }, { status: 400 })
    }
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, name } = await req.json()
    if (!id && !name) return NextResponse.json({ error: 'id or name required' }, { status: 400 })
    if (id) {
      await prisma.user.delete({ where: { id } }).catch(()=>{})
    } else if (name) {
      await prisma.user.delete({ where: { name } }).catch(()=>{})
    }
    return NextResponse.json({ success: true })
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
