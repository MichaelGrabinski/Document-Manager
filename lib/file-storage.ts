import { promises as fs } from 'fs'
import path from 'path'

const STORAGE_DIR = path.join(process.cwd(), 'stored-pdfs')

export async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
  return STORAGE_DIR
}

export async function savePdfFile(file: File): Promise<{ storedFileName: string; originalFileName: string; absPath: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  await ensureStorageDir()
  // generate unique name to avoid clashes
  const time = Date.now()
  const safeOriginal = file.name.split(/[\\/]/).pop() || `upload-${time}.pdf`
  const storedFileName = `${time}-${safeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const absPath = path.join(STORAGE_DIR, storedFileName)
  await fs.writeFile(absPath, buffer)
  return { storedFileName, originalFileName: safeOriginal, absPath }
}

export function buildPublicServePath(storedFileName: string) {
  return `/api/file/${encodeURIComponent(storedFileName)}`
}