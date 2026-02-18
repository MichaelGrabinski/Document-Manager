import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

function toClient(group: any) {
  if (!group) return group
  return {
    ...group,
    searchKeys: parseArray(group.searchKeys),
    allowedRoles: parseArray(group.allowedRoles),
  }
}

function fromClient(payload: any) {
  return {
    ...payload,
    searchKeys: Array.isArray(payload.searchKeys) ? JSON.stringify(payload.searchKeys) : payload.searchKeys ?? "[]",
    allowedRoles: Array.isArray(payload.allowedRoles) ? JSON.stringify(payload.allowedRoles) : payload.allowedRoles ?? "[]",
  }
}

function parseArray(v: any): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export async function GET() {
  const groups = await prisma.group.findMany({ orderBy: { createdAt: "asc" } })
  if (groups.length === 0) {
    const seed = await prisma.group.create({ data: { name: "General", searchKeys: JSON.stringify(["general", "uncategorized"]) } })
    return NextResponse.json([toClient(seed)])
  }
  return NextResponse.json(groups.map(toClient))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const schema = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
      searchKeys: z.array(z.string()).optional(),
      allowedRoles: z.array(z.string()).optional(),
    })
    const payload = schema.parse(body)
    const id = payload.id
    let created = false
    let group
    if (id) {
      const existing = await prisma.group.findUnique({ where: { id } })
      if (existing) {
        group = await prisma.group.update({ where: { id }, data: fromClient(payload) })
      } else {
        group = await prisma.group.create({ data: fromClient(payload) })
        created = true
      }
    } else {
      group = await prisma.group.create({ data: fromClient(payload) })
      created = true
    }
    return NextResponse.json({ success: true, created, group: toClient(group) })
  } catch (e:any) {
    if (e.name === 'ZodError') {
      return NextResponse.json({ error: e.errors?.map((err:any)=>err.message).join(', ') }, { status: 400 })
    }
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (id) {
    await prisma.group.delete({ where: { id } }).catch(() => {})
  }
  return NextResponse.json({ success: true })
}
