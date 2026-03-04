import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

const DJANGO = process.env.DJANGO_ORIGIN || 'http://127.0.0.1:8000'

// Serve stored PDFs: try local stored-pdfs/ first (legacy), then proxy to Django
export async function GET(req: NextRequest, context: Promise<{ params: { name: string } }>) {
  const { params } = await context
  const name = params.name
  if (!name || name.includes('..')) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })

  // 1. Try legacy local storage
  try {
    const filePath = path.join(process.cwd(), 'stored-pdfs', name)
    const data = await fs.readFile(filePath)
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` },
    })
  } catch {}

  // 2. Find doc in Django by storedFileName, then proxy the file
  try {
    const listResp = await fetch(`${DJANGO}/file/api/documents/`, {
      headers: { cookie: req.headers.get('cookie') || '' },
    })
    if (listResp.ok) {
      const docs: any[] = await listResp.json().catch(() => [])
      const doc = docs.find((d: any) => d.storedFileName === name || d.originalFileName === name)
      if (doc?.id) {
        const fileResp = await fetch(`${DJANGO}/file/api/documents/${doc.id}/`, {
          headers: { cookie: req.headers.get('cookie') || '' },
        })
        if (fileResp.ok) {
          const buf = Buffer.from(await fileResp.arrayBuffer())
          return new NextResponse(new Uint8Array(buf), {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` },
          })
        }
      }
    }
  } catch (e: any) {
    console.error('Django file proxy failed', e?.message)
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
