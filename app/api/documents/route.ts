import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Helpers to convert between DB (JSON string) and client (array) representations
function toClient(doc: any) {
  if (!doc) return doc
  return {
    ...doc,
    keywords: safeParseArray(doc.keywords),
    aiExtractedKeywords: safeParseArray(doc.aiExtractedKeywords),
  }
}

function fromClient(payload: any) {
  return {
    ...payload,
    keywords: Array.isArray(payload.keywords) ? JSON.stringify(payload.keywords) : payload.keywords ?? "[]",
    aiExtractedKeywords: Array.isArray(payload.aiExtractedKeywords)
      ? JSON.stringify(payload.aiExtractedKeywords)
      : payload.aiExtractedKeywords ?? "[]",
  }
}

function safeParseArray(v: any): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export async function GET() {
  const docs = await prisma.document.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json(docs.map(toClient))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const schema = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      type: z.literal('pdf'),
      keywords: z.array(z.string()).optional().default([]),
      uploader: z.string().min(1),
      groupId: z.string().nullable().optional(),
      aiSummary: z.string().optional(),
      aiExtractedKeywords: z.array(z.string()).optional(),
      fullSimulatedText: z.string().optional(),
  originalFileName: z.string().optional(),
  storedFileName: z.string().optional(),
    })
    const payload = schema.parse(body)
    const id = payload.id
    let created = false
    let doc
    if (id) {
      const existing = await prisma.document.findUnique({ where: { id } })
      if (existing) {
        doc = await prisma.document.update({ where: { id }, data: fromClient(payload) })
      } else {
        doc = await prisma.document.create({ data: fromClient(payload) })
        created = true
      }
    } else {
      doc = await prisma.document.create({ data: fromClient(payload) })
      created = true
    }
    return NextResponse.json({ success: true, created, doc: toClient(doc) })
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
    await prisma.document.delete({ where: { id } }).catch(() => {})
  }
  return NextResponse.json({ success: true })
}
