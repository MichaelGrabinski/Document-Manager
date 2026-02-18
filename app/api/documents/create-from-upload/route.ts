import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { savePdfFile } from "@/lib/file-storage"
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as pako from 'pako'
// Attempt to preload pdfjs worker so bundler emits chunk; ignore if missing
try { require('pdfjs-dist/legacy/build/pdf.worker.mjs') } catch {}

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
  const file = form.get("file") as File | null
    const uploader = form.get("uploader") as string | null
    const groupId = form.get("groupId") as string | null
    const keywordsRaw = form.get("keywords") as string | null // comma separated
  const overrideName = form.get("overrideName") as string | null

    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 })
    if (!uploader) return NextResponse.json({ error: "Uploader required" }, { status: 400 })
    if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF accepted" }, { status: 400 })

    const keywords = keywordsRaw ? keywordsRaw.split(",").map(k => k.trim()).filter(Boolean) : []

  const { storedFileName, originalFileName } = await savePdfFile(file)

  const useReal = process.env.USE_REAL_PDF_TEXT === 'true'
  if (process.env.DISABLE_AI === "true" || !process.env.OPENAI_API_KEY) {
      // Create without AI
      const doc = await prisma.document.create({
        data: {
          name: file.name.replace(/\.pdf$/i, ""),
          type: "pdf",
          uploader,
          groupId: groupId || null,
          keywords: JSON.stringify(keywords),
          aiSummary: process.env.DISABLE_AI === "true" ? "AI disabled (mock)." : undefined,
          aiExtractedKeywords: JSON.stringify([]),
                fullSimulatedText: process.env.DISABLE_AI === "true" ? "Mock mode: no extraction." : (useReal ? await extractPdfText(file) : undefined),
      originalFileName,
      storedFileName,
        },
      })
      return NextResponse.json({ success: true, doc: toClient(doc), ai: false })
    }

  // Sanitize: remove any folder prefixes if present
  const rawName = overrideName && overrideName.trim() ? overrideName.trim() : file.name
  const fileName = rawName.split(/[\\/]/).pop()!.replace(/\.pdf$/i, "")
    const fileSize = file.size

  let extractedText = useReal ? await extractPdfText(file) : ''
  let extractionStage = extractedText ? 'text-layer' : 'none'
    if (useReal && (!extractedText || extractedText.trim().length < 25)) {
      // Attempt OCR fallback (likely scanned PDF) limited pages
      try {
    const ocrText = await ocrPdf(file, 6) // limit to first 6 pages for speed
        if (ocrText.trim().length > extractedText.trim().length) extractedText = ocrText
    if (ocrText.trim().length > 0) extractionStage = 'ocr'
      } catch (e) {
        console.error('OCR fallback failed', e)
      }
    }
    const baseText = extractedText && extractedText.trim().length > 0 ? extractedText.slice(0, 20000) : ''
    if (process.env.EXTRACTION_DEBUG === 'true') {
      console.log('[extract] final length', baseText.length)
    }
    let summaryText = ''
    let extracted: string[] = []
    if (baseText.length === 0) {
      summaryText = 'No textual content extracted (PDF may be image-only or encrypted).'
    } else {
      // Only use AI to summarize & extract keywords, never to fabricate full text
      const summary = await generateText({
        model: openai("gpt-4o"),
        system: "Summarize document",
        prompt: baseText,
      })
      const kw = await generateText({
        model: openai("gpt-4o"),
        system: "Extract keywords",
        prompt: `Extract 5-7 domain-specific keywords from this text, comma separated:\n${baseText}`,
      })
      extracted = kw.text.split(",").map(k => k.trim()).filter(k => k.length > 2).slice(0,7)
      summaryText = summary.text
    }

  const doc = await prisma.document.create({
      data: {
        name: fileName,
        type: "pdf",
        uploader,
        groupId: groupId || null,
        keywords: JSON.stringify(keywords),
  aiSummary: summaryText,
  aiExtractedKeywords: JSON.stringify(extracted),
      fullSimulatedText: baseText, // only real extracted (PDF or OCR) text
    originalFileName,
    storedFileName,
      },
    })

  return NextResponse.json({ success: true, doc: { ...toClient(doc), extractionStage }, ai: true })
  } catch (e: any) {
    console.error("create-from-upload error", e)
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}

function toClient(doc: any) {
  return {
    ...doc,
    keywords: safe(doc.keywords),
    aiExtractedKeywords: safe(doc.aiExtractedKeywords),
  }
}
function safe(v: any) { try { if (Array.isArray(v)) return v; if (typeof v === 'string') { const p = JSON.parse(v); return Array.isArray(p)?p:[] } } catch {} return [] }

async function extractPdfText(file: File): Promise<string> {
  // Strategy order (avoid pdfjs worker issues unless needed):
  // 1. Literal string scan (Tj/TJ)
    // 2. Hex string scan
    // 3. Flate-decoded stream scan
    // 4. (Optional) pdfjs full text extraction if env forces or previous steps too small
  // 5. External CLI pdftotext (Poppler) if available / enabled
  const dataBuf = Buffer.from(await file.arrayBuffer())
  let stageLabel = 'none'
  let stage1 = simpleStringScan(dataBuf)
  if (stage1.trim().length > 40) {
    const cleaned = maybeClean(stage1)
  if (cleaned.accept) { (globalThis as any).__lastExtractionStage = 'literal-scan'; return cleaned.text.slice(0, 200_000) }
  }

    let stageHex = hexStringScan(dataBuf)
    if (stageHex && stageHex.trim().length > stage1.trim().length && stageHex.trim().length > 40) {
      const cleanedHex = maybeClean(stageHex)
    if (cleanedHex.accept) { (globalThis as any).__lastExtractionStage = 'hex-scan'; return cleanedHex.text.slice(0, 200_000) }
    }

  let stage2 = flateStreamScan(dataBuf)
  if (stage2.trim().length > stage1.trim().length && stage2.trim().length > 40) {
    const cleaned2 = maybeClean(stage2)
  if (cleaned2.accept) { (globalThis as any).__lastExtractionStage = 'flate-scan'; return cleaned2.text.slice(0, 200_000) }
  }

  // Only attempt pdfjs if explicitly allowed (default still try if everything empty)
  const forcePdfJs = process.env.FORCE_PDFJS === 'true' || (stage1.trim().length + stageHex.trim().length + stage2.trim().length) < 40

  // Try external pdftotext if enabled or content still weak (compute after forcePdfJs var)
  const enablePdfToText = process.env.ENABLE_PDFTOTEXT === 'true'
  if (enablePdfToText || (!forcePdfJs && (stage1+stageHex+stage2).trim().length < 120)) {
    try {
      const cli = process.env.PDFTOTEXT_PATH || 'pdftotext'
      const out = await runPdfToTextCLI(cli, dataBuf)
      if (out && out.trim().length > 40) {
        const cleanedCli = maybeClean(out)
        if (cleanedCli.text.trim().length > 0) { (globalThis as any).__lastExtractionStage = 'pdftotext-cli'; return cleanedCli.text.slice(0,200_000) }
      }
    } catch (e:any) {
      console.warn('pdftotext CLI fallback failed', e?.message)
    }
  }

  // pdf-parse fallback (often handles text layer robustly without manual worker mgmt)
  const forcePdfParse = process.env.FORCE_PDF_PARSE === 'true'
  if (forcePdfParse || (!forcePdfJs && (stage1+stageHex+stage2).trim().length < 80)) {
    try {
      const pdfParse = await import('pdf-parse') as any
      const parsed = await pdfParse.default(dataBuf).catch((e: any)=>{ console.warn('pdf-parse failed', e.message); return null })
      if (parsed && typeof parsed.text === 'string' && parsed.text.trim().length > 40) {
        const cleaned = maybeClean(parsed.text)
        if (cleaned.text.trim().length > 0) return cleaned.text.slice(0, 200_000)
      }
    } catch (e:any) {
      console.warn('pdf-parse import/use error', e?.message)
    }
  }
  if (!forcePdfJs) {
    // Return best cleaned attempt even if noisy
    const best = stage2.trim().length > stage1.trim().length ? stage2 : stage1
    const cleanedBest = maybeClean(best)
  ;(globalThis as any).__lastExtractionStage = cleanedBest.text ? 'fallback-best' : 'none'
  return cleanedBest.text.slice(0, 200_000)
  }

  try {
    const pdfjsLib = await loadPdfJs()
    const getDocument = (pdfjsLib as any).getDocument
    const pdf = await getDocument({ data: new Uint8Array(dataBuf), disableWorker: true, useSystemFonts: true }).promise
    let text = ''
  const maxPages = Math.min(pdf.numPages, 30)
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent().catch(()=>null)
      if (!content) continue
      const strings = (content.items || []).map((it:any)=> it.str).filter(Boolean)
      if (strings.length) text += strings.join(' ') + '\n'
      if (text.length > 200_000) break
    }
    if (text.trim().length < 20) {
      const best = [stage2, stageHex, stage1].sort((a,b)=>b.length-a.length)[0]
      const cleanedBest = maybeClean(best)
      ;(globalThis as any).__lastExtractionStage = cleanedBest.text ? 'fallback-best' : 'none'
      return cleanedBest.text.slice(0, 200_000)
    }
    const cleanedPdfjs = maybeClean(text)
    ;(globalThis as any).__lastExtractionStage = 'pdfjs'
    return cleanedPdfjs.text.slice(0, 200_000)
  } catch (e) {
    console.error('PDF extract failed (pre-OCR fallback)', e)
    const best = [stage2, stageHex, stage1].sort((a,b)=>b.length-a.length)[0]
    const cleanedBest = maybeClean(best)
    ;(globalThis as any).__lastExtractionStage = cleanedBest.text ? 'fallback-best' : 'none'
    return cleanedBest.text
  }
}
// Extract hex string text sequences like <54657374> (Test)
function hexStringScan(buffer: Buffer): string {
  try {
    const text = buffer.toString('latin1')
    const results: string[] = []
    const hexRe = /<([0-9A-Fa-f]{4,})>\s*(?:Tj|TJ)/g
    let m: RegExpExecArray | null
    while ((m = hexRe.exec(text)) !== null) {
      const hex = m[1]
      // decode bytes
      let out = ''
      for (let i=0;i<hex.length;i+=2) {
        const byte = parseInt(hex.slice(i,i+2),16)
        if (byte === 0x0A || byte === 0x0D) { out += '\n'; continue }
        if (byte >= 32 && byte <= 126) out += String.fromCharCode(byte)
      }
      out = out.trim()
      if (out) results.push(out)
      if (results.join(' ').length > 200_000) break
    }
    return results.join('\n')
  } catch { return '' }
}

async function ocrPdf(file: File, pageLimit = 5): Promise<string> {
  try {
    const [{ createWorker }] = await Promise.all([
      import('tesseract.js')
    ])
    const pdfjsLib = await loadPdfJs()
    const getDocument = (pdfjsLib as any).getDocument
    const data = new Uint8Array(await file.arrayBuffer())
    const loadingTask = getDocument({ data, disableWorker: true })
    const pdf = await loadingTask.promise
    let createCanvas: any
    try { ({ createCanvas } = await import('canvas')) } catch {
      console.warn('No node-canvas available; skipping OCR')
      return ''
    }
    let worker: any
    try {
      worker = await (createWorker as any)({ logger: ()=>{} })
      await worker.loadLanguage('eng')
      await worker.initialize('eng')
    } catch (e) {
      console.error('Tesseract worker init failed', e)
      return ''
    }
    let ocrText = ''
    const total = Math.min(pdf.numPages, pageLimit)
    for (let pageNum = 1; pageNum <= total; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = createCanvas(viewport.width, viewport.height)
      const ctx = canvas.getContext('2d')
      const renderContext = { canvasContext: ctx, viewport }
      try {
        await page.render(renderContext).promise
        // Simple pre-processing: grayscale & threshold to improve OCR on faint scans
        try {
          const imageData = ctx.getImageData(0,0,canvas.width, canvas.height)
          const d = imageData.data
            for (let i=0;i<d.length;i+=4) {
              const r=d[i], g=d[i+1], b=d[i+2]
              const y = 0.299*r + 0.587*g + 0.114*b
              const v = y > 180 ? 255 : (y < 80 ? 0 : y)
              d[i]=d[i+1]=d[i+2]=v
            }
          ctx.putImageData(imageData,0,0)
        } catch {}
        const png = canvas.toBuffer('image/png')
        const { data: { text } } = await worker.recognize(png)
        ocrText += text + '\n'
      } catch (e) {
        console.error('OCR page failed', e)
      }
      if (ocrText.length > 200_000) break
    }
    try { await worker.terminate() } catch {}
    if (ocrText.trim().length > 0) {
      ;(globalThis as any).__lastExtractionStage = 'ocr'
    }
    return ocrText
  } catch (e) {
    console.error('OCR processing failed', e)
    return ''
  }
}

async function loadPdfJs(): Promise<any> {
  if (!(globalThis as any).DOMMatrix) {
    // Lightweight DOMMatrix polyfill sufficient for text layer transform math
    ;(globalThis as any).DOMMatrix = class { a=1;b=0;c=0;d=1;e=0;f=0 } as any
  }
  // Attempt legacy then fallback
  let lib: any
  try { lib = await import('pdfjs-dist/legacy/build/pdf.mjs') } catch {}
  if (!lib || !lib.getDocument) {
    try { lib = await import('pdfjs-dist/build/pdf.mjs') } catch {}
  }
  if (!lib || !lib.getDocument) {
    lib = await import('pdfjs-dist')
  }
  try {
    // Force no-worker mode
    ;(lib as any).GlobalWorkerOptions.workerSrc = ''
    ;(lib as any).disableWorker = true
  } catch {}
  return lib
}

function simpleStringScan(buffer: Buffer): string {
  try {
    const text = buffer.toString('latin1') // preserve bytes
    // Extract literal strings inside parentheses followed by Tj or inside TJ arrays
    const results: string[] = []
    const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|TJ)/g
    let m: RegExpExecArray | null
    while ((m = literalRegex.exec(text)) !== null) {
      let s = m[1]
      s = s.replace(/\\(n|r|t|b|f|\\|\(|\))/g, (_full, esc) => {
        switch (esc) { case 'n': return '\n'; case 'r': return '\r'; case 't': return '\t'; case 'b': return '\b'; case 'f': return '\f'; case '(': return '('; case ')': return ')'; case '\\': return '\\'; default: return esc }
      })
      if (s.trim().length > 0) results.push(s.trim())
      if (results.join(' ').length > 200_000) break
    }
    return results.join('\n')
  } catch (e) {
    return ''
  }
}

// Attempt to find Flate decoded streams and extract readable text tokens
function flateStreamScan(buffer: Buffer): string {
  try {
    const src = buffer.toString('latin1')
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = streamRegex.exec(src)) !== null) {
      const raw = m[1]
      // Heuristic: only attempt if contains non-ASCII control bytes (likely compressed)
      const byteArr = Buffer.from(raw, 'latin1')
      // Try inflate
      try {
        const inflated = pako.inflate(byteArr, { to: 'string' }) as string
        // Pull out possible words (A-Z sequences) of length >=3
        const words = inflated.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g)
        if (words && words.length > 10) {
          out.push(words.slice(0, 2000).join(' '))
        }
      } catch {}
      if (out.join(' ').length > 200_000) break
    }
    return out.join('\n')
  } catch {
    return ''
  }
}

// Assess and optionally clean the extracted raw text
function maybeClean(raw: string): { text: string; accept: boolean } {
  if (process.env.RAW_PDF_TEXT === 'true') return { text: raw, accept: true }
  const cleaned = cleanExtractedText(raw)
  const score = signalScore(cleaned)
  const accept = score >= 0.18 || cleaned.split(/\s+/).length > 50
  return { text: cleaned, accept }
}

function cleanExtractedText(raw: string): string {
  const DROP_TOKENS = new Set([
    'CIDInit','ProcSet','findresource','begincmap','CMapName','defineresource','FontDescriptor','FontBBox','BaseFont','Encoding','WinAnsiEncoding','FirstChar','LastChar','ToUnicode','Widths','Catalog','Pages','Creator','CreationDate','ModDate','XObject','ImageC','ImageB','Type','Subtype','Parent','Resources','Font','Count','Kids'
  ])
  const lines = raw.split(/\r?\n/)
  const kept: string[] = []
  for (let line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Remove lines that are just font refs like F_0 F_1 etc
    if (/^(F_\d+\s+){3,}F_\d+$/.test(trimmed)) continue
    if (/^F_\d+$/.test(trimmed)) continue
    // Drop artifact / pagination structural markers
    if (/^(Artifact|BDC|EMC|MCID|StructParent|Pagination)$/i.test(trimmed)) continue
    // If line mostly composed of F_x tokens and short words
    const fTokDensity = (trimmed.match(/F_\d+/g) || []).length / Math.max(trimmed.split(/\s+/).length,1)
    if (fTokDensity > 0.6) continue
    // If line contains many PDF structural tokens, drop
    const tokens = trimmed.split(/\s+/)
    const structuralCount = tokens.filter(t => DROP_TOKENS.has(t)).length
    if (structuralCount >= 3) continue
    // If line has very low letter to length ratio, skip
    const letters = (trimmed.match(/[A-Za-z]/g) || []).length
    if (letters / Math.max(trimmed.length,1) < 0.25) continue
    // Remove isolated remaining F_x tokens inline if they dominate
    let cleanedLine = trimmed.replace(/\bF_\d+\b/g, ' ').replace(/\s+/g,' ').trim()
    if (!cleanedLine) continue
    // Collapse repeated structural words
    cleanedLine = cleanedLine.replace(/\b(Artifact|BDC|EMC)\b/gi,'').replace(/\s+/g,' ').trim()
    if (!cleanedLine) continue
    // Skip if still mainly capitals without vowels (likely garbage)
    const vowelRatio = (cleanedLine.match(/[AEIOUaeiou]/g)||[]).length / Math.max(cleanedLine.replace(/[^A-Za-z]/g,'').length,1)
    if (vowelRatio < 0.2 && cleanedLine.split(/\s+/).length < 8) continue
    line: {
      kept.push(cleanedLine)
    }
    kept.push(trimmed)
    if (kept.join('\n').length > 200_000) break
  }
  // Deduplicate adjacent duplicates
  const dedup: string[] = []
  for (const l of kept) {
    if (dedup.length === 0 || dedup[dedup.length-1] !== l) dedup.push(l)
  }
  return dedup.join('\n')
}

function signalScore(text: string): number {
  const tokens = text.split(/\s+/)
  if (tokens.length === 0) return 0
  const wordLike = tokens.filter(t => /[A-Za-z]{3,}/.test(t)).length
  return wordLike / tokens.length
}

async function runPdfToTextCLI(cli: string, data: Buffer): Promise<string> {
  // Write temp file
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `dm-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  try {
    await fs.promises.writeFile(inputPath, data)
    const { exec } = await import('child_process')
    const cmd = `${cli} "${inputPath}" -` // output to stdout
    return await new Promise<string>((resolve) => {
      const child = exec(cmd, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve('')
        resolve(stdout || '')
      })
      // Safety timeout
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve('') }, 15000)
    })
  } catch (e) {
    return ''
  } finally {
    try { await fs.promises.unlink(inputPath) } catch {}
  }
}

