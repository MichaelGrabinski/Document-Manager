import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'

// Dynamic route to serve stored PDFs securely (basic)
export async function GET(_req: NextRequest, context: Promise<{ params: { name: string } }>) {
  try {
  const { params } = await context
  const name = params.name
    if (!name || name.includes('..')) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    const filePath = path.join(process.cwd(), 'stored-pdfs', name)
    const data = await fs.readFile(filePath)
  return new NextResponse(new Uint8Array(data), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` } })
  } catch (e:any) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
