import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import fs from "fs"
import os from "os"
import path from "path"
import * as pako from "pako"

export const runtime = "nodejs"

const DJANGO = process.env.DJANGO_ORIGIN || "http://127.0.0.1:8000"

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const uploader = form.get("uploader") as string | null
    const groupId = form.get("groupId") as string | null
    const keywordsRaw = form.get("keywords") as string | null
    const overrideName = form.get("overrideName") as string | null

    if (!file) return NextResponse.json({ error: "File required" }, { status: 400 })
    if (!uploader) return NextResponse.json({ error: "Uploader required" }, { status: 400 })
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "Only PDF accepted" }, { status: 400 })

    const keywords = keywordsRaw
      ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
      : []

    const rawName = overrideName?.trim() ? overrideName.trim() : file.name
    const fileName = rawName.split(/[\\/]/).pop()!.replace(/\.pdf$/i, "")

    const useReal = process.env.USE_REAL_PDF_TEXT === "true"

    let summaryText = ""
    let extracted: string[] = []
    let fullText = ""
    let extractionStage = "none"
    let aiUsed = false

    // ── Step 1: ALWAYS extract text (text-layer first, then OCR fallback) ──
    if (useReal) {
      console.log("[upload] Step 1: extracting text from PDF via text-layer…")
      fullText = await extractPdfText(file)
      extractionStage = fullText && fullText.trim().length > 25 ? "text-layer" : "none"
      console.log(`[upload]   text-layer extracted ${fullText.trim().length} chars (stage=${extractionStage})`)

      // OCR fallback if text-layer produced too little
      if (!fullText || fullText.trim().length < 25) {
        console.log("[upload] Step 1b: text-layer insufficient, trying OCR (tesseract)…")
        try {
          const ocrText = await ocrPdf(file, 8)
          console.log(`[upload]   OCR extracted ${ocrText.trim().length} chars`)
          if (ocrText.trim().length > (fullText?.trim().length || 0)) {
            fullText = ocrText
            if (ocrText.trim().length > 0) extractionStage = "ocr"
          }
        } catch (e) {
          console.error("[upload]   OCR fallback failed", e)
        }
      }
    }

    const baseText = fullText && fullText.trim().length > 0 ? fullText.slice(0, 20000) : ""

    // ── Step 2: Generate keywords + summary ──
    if (baseText.length === 0) {
      summaryText = "No textual content extracted (PDF may be image-only or encrypted)."
      console.log("[upload] Step 2: no text available for keyword extraction")
    } else if (process.env.DISABLE_AI !== "true" && process.env.OPENAI_API_KEY) {
      // Use OpenAI for high-quality extraction
      console.log("[upload] Step 2: using OpenAI for summary + keywords…")
      try {
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
        extracted = kw.text
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 2)
          .slice(0, 7)
        summaryText = summary.text
        aiUsed = true
      } catch (e: any) {
        console.error("[upload]   OpenAI call failed, falling back to local extraction:", e?.message)
        // Fall through to local extraction below
      }
    }

    // ── Step 2b: Local keyword extraction (always runs if AI didn't) ──
    if (!aiUsed && baseText.length > 0) {
      console.log("[upload] Step 2b: using local keyword extraction (no OpenAI key)…")
      extracted = extractKeywordsLocal(baseText)
      summaryText = generateLocalSummary(baseText, fileName)
      console.log(`[upload]   local keywords: [${extracted.join(", ")}]`)
    }

    // Forward file + enriched metadata to Django
    const outForm = new FormData()
    outForm.append("file", file, file.name)
    outForm.append("uploader", uploader)
    if (groupId) outForm.append("groupId", groupId)
    outForm.append("overrideName", fileName + ".pdf")
    outForm.append("keywords", JSON.stringify(keywords))
    outForm.append("aiExtractedKeywords", JSON.stringify(extracted))
    if (summaryText) outForm.append("aiSummary", summaryText)
    if (fullText) outForm.append("fullText", fullText)

    const djangoResp = await fetch(`${DJANGO}/file/api/documents/upload/`, {
      method: "POST",
      headers: { cookie: req.headers.get("cookie") || "" },
      body: outForm,
    })
    const data = await djangoResp.json().catch(() => ({ error: "Django parse error" }))
    if (!djangoResp.ok) {
      return NextResponse.json(data, { status: djangoResp.status })
    }

    const res = NextResponse.json({ ...data, ai: aiUsed, extractionStage })
    djangoResp.headers.getSetCookie?.()?.forEach((c) => res.headers.append("set-cookie", c))
    return res
  } catch (e: any) {
    console.error("create-from-upload error", e)
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 })
  }
}

//  PDF text extraction helpers (unchanged logic) 

function hexStringScan(buffer: Buffer): string {
  try {
    const text = buffer.toString("latin1")
    const results: string[] = []
    const hexRe = /<([0-9A-Fa-f]{4,})>\s*(?:Tj|TJ)/g
    let m: RegExpExecArray | null
    while ((m = hexRe.exec(text)) !== null) {
      const hex = m[1]
      let out = ""
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.slice(i, i + 2), 16)
        if (byte === 0x0a || byte === 0x0d) { out += "\n"; continue }
        if (byte >= 32 && byte <= 126) out += String.fromCharCode(byte)
      }
      out = out.trim()
      if (out) results.push(out)
      if (results.join(" ").length > 200_000) break
    }
    return results.join("\n")
  } catch { return "" }
}

function simpleStringScan(buffer: Buffer): string {
  try {
    const text = buffer.toString("latin1")
    const results: string[] = []
    const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|TJ)/g
    let m: RegExpExecArray | null
    while ((m = literalRegex.exec(text)) !== null) {
      let s = m[1]
      s = s.replace(/\\(n|r|t|b|f|\\|\(|\))/g, (_full, esc) => {
        switch (esc) {
          case "n": return "\n"; case "r": return "\r"; case "t": return "\t"
          case "b": return "\b"; case "f": return "\f"
          case "(": return "("; case ")": return ")"; case "\\": return "\\"
          default: return esc
        }
      })
      if (s.trim().length > 0) results.push(s.trim())
      if (results.join(" ").length > 200_000) break
    }
    return results.join("\n")
  } catch { return "" }
}

function flateStreamScan(buffer: Buffer): string {
  try {
    const src = buffer.toString("latin1")
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = streamRegex.exec(src)) !== null) {
      const byteArr = Buffer.from(m[1], "latin1")
      try {
        const inflated = pako.inflate(byteArr, { to: "string" }) as string
        const words = inflated.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g)
        if (words && words.length > 10) out.push(words.slice(0, 2000).join(" "))
      } catch {}
      if (out.join(" ").length > 200_000) break
    }
    return out.join("\n")
  } catch { return "" }
}

function signalScore(text: string): number {
  const tokens = text.split(/\s+/)
  if (tokens.length === 0) return 0
  return tokens.filter((t) => /[A-Za-z]{3,}/.test(t)).length / tokens.length
}

function cleanExtractedText(raw: string): string {
  const DROP = new Set([
    "CIDInit","ProcSet","findresource","begincmap","CMapName","defineresource",
    "FontDescriptor","FontBBox","BaseFont","Encoding","WinAnsiEncoding",
    "FirstChar","LastChar","ToUnicode","Widths","Catalog","Pages","Creator",
    "CreationDate","ModDate","XObject","ImageC","ImageB","Type","Subtype",
    "Parent","Resources","Font","Count","Kids",
  ])
  const kept: string[] = []
  for (let line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    if (/^(F_\d+\s+){3,}F_\d+$/.test(t)) continue
    if (/^F_\d+$/.test(t)) continue
    if (/^(Artifact|BDC|EMC|MCID|StructParent|Pagination)$/i.test(t)) continue
    const fD = (t.match(/F_\d+/g) || []).length / Math.max(t.split(/\s+/).length, 1)
    if (fD > 0.6) continue
    const toks = t.split(/\s+/)
    if (toks.filter((x) => DROP.has(x)).length >= 3) continue
    const letters = (t.match(/[A-Za-z]/g) || []).length
    if (letters / Math.max(t.length, 1) < 0.25) continue
    let cl = t.replace(/\bF_\d+\b/g, " ").replace(/\s+/g, " ").trim()
    if (!cl) continue
    cl = cl.replace(/\b(Artifact|BDC|EMC)\b/gi, "").replace(/\s+/g, " ").trim()
    if (!cl) continue
    const vR = (cl.match(/[AEIOUaeiou]/g) || []).length / Math.max(cl.replace(/[^A-Za-z]/g, "").length, 1)
    if (vR < 0.2 && cl.split(/\s+/).length < 8) continue
    kept.push(cl)
    if (kept.join("\n").length > 200_000) break
  }
  const dedup: string[] = []
  for (const l of kept)
    if (dedup.length === 0 || dedup[dedup.length - 1] !== l) dedup.push(l)
  return dedup.join("\n")
}

function maybeClean(raw: string): { text: string; accept: boolean } {
  if (process.env.RAW_PDF_TEXT === "true") return { text: raw, accept: true }
  const cleaned = cleanExtractedText(raw)
  const accept = signalScore(cleaned) >= 0.18 || cleaned.split(/\s+/).length > 50
  return { text: cleaned, accept }
}

async function runPdfToTextCLI(cli: string, data: Buffer): Promise<string> {
  const tmpDir = os.tmpdir()
  const inputPath = path.join(tmpDir, `dm-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  try {
    await fs.promises.writeFile(inputPath, data)
    const { exec } = await import("child_process")
    const cmd = `${cli} "${inputPath}" -`
    return await new Promise<string>((resolve) => {
      const child = exec(cmd, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve("")
        resolve(stdout || "")
      })
      setTimeout(() => { try { child.kill("SIGKILL") } catch {} resolve("") }, 15000)
    })
  } catch { return "" } finally {
    try { await fs.promises.unlink(inputPath) } catch {}
  }
}

async function loadPdfJs(): Promise<any> {
  // Apply polyfills from @napi-rs/canvas if available (Path2D, DOMMatrix, etc.)
  try {
    const napiCanvas = require("@napi-rs/canvas")
    if (!(globalThis as any).Path2D && napiCanvas.Path2D) (globalThis as any).Path2D = napiCanvas.Path2D
    if (!(globalThis as any).DOMMatrix && napiCanvas.DOMMatrix) (globalThis as any).DOMMatrix = napiCanvas.DOMMatrix
    if (!(globalThis as any).DOMPoint && napiCanvas.DOMPoint) (globalThis as any).DOMPoint = napiCanvas.DOMPoint
    if (!(globalThis as any).DOMRect && napiCanvas.DOMRect) (globalThis as any).DOMRect = napiCanvas.DOMRect
    if (!(globalThis as any).ImageData && napiCanvas.ImageData) (globalThis as any).ImageData = napiCanvas.ImageData
  } catch {
    if (!(globalThis as any).DOMMatrix)
      (globalThis as any).DOMMatrix = class { a=1;b=0;c=0;d=1;e=0;f=0 } as any
  }
  let lib: any
  try { lib = await import("pdfjs-dist/legacy/build/pdf.mjs") } catch {}
  if (!lib?.getDocument) try { lib = await import("pdfjs-dist/build/pdf.mjs") } catch {}
  if (!lib?.getDocument) lib = await import("pdfjs-dist")
  try {
    // pdfjs-dist v5 requires a valid workerSrc even with disableWorker
    // Resolve the worker file path as a file:// URL (required on Windows)
    const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"))
    const workerFile = path.join(pdfjsDir, "legacy", "build", "pdf.worker.mjs")
    const { pathToFileURL } = await import("url")
    ;(lib as any).GlobalWorkerOptions.workerSrc = pathToFileURL(workerFile).href
  } catch {
    try { (lib as any).GlobalWorkerOptions.workerSrc = ""; (lib as any).disableWorker = true } catch {}
  }
  return lib
}

async function extractPdfText(file: File): Promise<string> {
  const dataBuf = Buffer.from(await file.arrayBuffer())
  const s1 = simpleStringScan(dataBuf)
  if (s1.trim().length > 40) { const c = maybeClean(s1); if (c.accept) return c.text.slice(0, 200_000) }
  const sh = hexStringScan(dataBuf)
  if (sh.trim().length > s1.trim().length && sh.trim().length > 40) { const c = maybeClean(sh); if (c.accept) return c.text.slice(0, 200_000) }
  const s2 = flateStreamScan(dataBuf)
  if (s2.trim().length > s1.trim().length && s2.trim().length > 40) { const c = maybeClean(s2); if (c.accept) return c.text.slice(0, 200_000) }
  const forcePdfJs = process.env.FORCE_PDFJS === "true" || (s1.trim().length + sh.trim().length + s2.trim().length) < 40
  if (process.env.ENABLE_PDFTOTEXT === "true" || (!forcePdfJs && (s1+sh+s2).trim().length < 120)) {
    try {
      const cli = process.env.PDFTOTEXT_PATH || "pdftotext"
      const out = await runPdfToTextCLI(cli, dataBuf)
      if (out?.trim().length > 40) { const c = maybeClean(out); if (c.text.trim().length > 0) return c.text.slice(0, 200_000) }
    } catch (e: any) { console.warn("pdftotext CLI failed", e?.message) }
  }
  if (process.env.FORCE_PDF_PARSE === "true" || (!forcePdfJs && (s1+sh+s2).trim().length < 80)) {
    try {
      const pdfParse = await import("pdf-parse") as any
      const parsed = await pdfParse.default(dataBuf).catch((e: any) => { console.warn("pdf-parse failed", e.message); return null })
      if (parsed?.text && parsed.text.trim().length > 40) { const c = maybeClean(parsed.text); if (c.text.trim().length > 0) return c.text.slice(0, 200_000) }
    } catch (e: any) { console.warn("pdf-parse error", e?.message) }
  }
  if (!forcePdfJs) {
    const best = s2.trim().length > s1.trim().length ? s2 : s1
    return maybeClean(best).text.slice(0, 200_000)
  }
  try {
    const pdfjsLib = await loadPdfJs()
    const pdf = await (pdfjsLib as any).getDocument({ data: new Uint8Array(dataBuf), disableWorker: true, useSystemFonts: true }).promise
    let text = ""
    const maxPages = Math.min(pdf.numPages, 30)
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent().catch(() => null)
      if (!content) continue
      text += (content.items || []).map((it: any) => it.str).filter(Boolean).join(" ") + "\n"
      if (text.length > 200_000) break
    }
    if (text.trim().length < 20) {
      const best = [s2, sh, s1].sort((a, b) => b.length - a.length)[0]
      return maybeClean(best).text.slice(0, 200_000)
    }
    return maybeClean(text).text.slice(0, 200_000)
  } catch {
    const best = [s2, sh, s1].sort((a, b) => b.length - a.length)[0]
    return maybeClean(best).text
  }
}

async function ocrPdf(file: File, pageLimit = 5): Promise<string> {
  const log = (msg: string) => { console.log(msg) }
  const logErr = (msg: string, e: any) => { console.error(msg, e) }
  try {
    log("[OCR] importing tesseract.js…")
    const [{ createWorker }] = await Promise.all([import("tesseract.js")])
    log("[OCR] importing pdfjs-dist…")
    const pdfjsLib = await loadPdfJs()
    const data = new Uint8Array(await file.arrayBuffer())
    log(`[OCR] PDF data: ${data.length} bytes`)

    // pdfjs-dist v5 uses @napi-rs/canvas for Node.js rendering (built-in NodeCanvasFactory)
    // serverExternalPackages ensures these are not bundled by webpack
    let napiCanvas: any
    try {
      napiCanvas = require("@napi-rs/canvas")
      log(`[OCR] @napi-rs/canvas loaded (createCanvas: ${typeof napiCanvas.createCanvas})`)
    } catch (e: any) { log(`[OCR] No @napi-rs/canvas: ${e?.message}`); return "" }

    // Polyfills for pdfjs-dist rendering in Node.js
    // @napi-rs/canvas provides Path2D, DOMPoint, DOMMatrix, DOMRect that pdfjs needs
    if (!(globalThis as any).Path2D && napiCanvas.Path2D) (globalThis as any).Path2D = napiCanvas.Path2D
    if (!(globalThis as any).DOMMatrix && napiCanvas.DOMMatrix) (globalThis as any).DOMMatrix = napiCanvas.DOMMatrix
    if (!(globalThis as any).DOMPoint && napiCanvas.DOMPoint) (globalThis as any).DOMPoint = napiCanvas.DOMPoint
    if (!(globalThis as any).DOMRect && napiCanvas.DOMRect) (globalThis as any).DOMRect = napiCanvas.DOMRect
    if (!(globalThis as any).ImageData && napiCanvas.ImageData) (globalThis as any).ImageData = napiCanvas.ImageData

    log("[OCR] opening PDF with pdfjs…")
    const pdf = await (pdfjsLib as any).getDocument({
      data, disableWorker: true, useSystemFonts: true, isEvalSupported: false,
    }).promise
    log(`[OCR] PDF opened: ${pdf.numPages} pages`)

    log(`[OCR] Initializing Tesseract worker…`)
    let worker: any
    try {
      // Tesseract.js v5+/v6 API: createWorker(lang, oem, options)
      worker = await (createWorker as any)("eng", 1, {
        cachePath: ".",
      })
      log("[OCR] Tesseract worker ready")
    } catch (e: any) { logErr("[OCR] Tesseract init failed", e); return "" }

    let ocrText = ""
    const total = Math.min(pdf.numPages, pageLimit)
    for (let p = 1; p <= total; p++) {
      try {
        const page = await pdf.getPage(p)
        const viewport = page.getViewport({ scale: 2.0 })
        log(`[OCR]   Page ${p}/${total}: viewport ${Math.round(viewport.width)}x${Math.round(viewport.height)}`)
        // Use @napi-rs/canvas for PDF rendering (pdfjs v5 compatible)
        const canvas = napiCanvas.createCanvas(viewport.width, viewport.height)
        const ctx = canvas.getContext("2d")

        await page.render({ canvasContext: ctx, viewport }).promise
        log(`[OCR]   Page ${p}/${total}: rendered`)

        // Export to PNG buffer for Tesseract OCR
        const pngBuf = canvas.toBuffer("image/png")
        log(`[OCR]   Page ${p}/${total}: PNG ${pngBuf.length} bytes`)

        const { data: { text } } = await worker.recognize(pngBuf)
        log(`[OCR]   Page ${p}/${total}: ${text.trim().length} chars OCR'd`)
        ocrText += text + "\n"
      } catch (e: any) { logErr(`[OCR]   Page ${p} failed`, e) }
      if (ocrText.length > 200_000) break
    }
    try { await worker.terminate() } catch {}
    log(`[OCR] Complete: ${ocrText.trim().length} total chars from ${total} pages`)
    return ocrText
  } catch (e: any) { logErr("[OCR] OCR failed", e); return "" }
}

// ── Local keyword extraction (no AI required) ──

const STOP_WORDS = new Set([
  "the","be","to","of","and","a","in","that","have","i","it","for","not","on",
  "with","he","as","you","do","at","this","but","his","by","from","they","we",
  "her","she","or","an","will","my","one","all","would","there","their","what",
  "so","up","out","if","about","who","get","which","go","me","when","make",
  "can","like","time","no","just","him","know","take","people","into","year",
  "your","good","some","could","them","see","other","than","then","now","look",
  "only","come","its","over","think","also","back","after","use","two","how",
  "our","work","first","well","way","even","new","want","because","any","these",
  "give","day","most","us","was","were","been","has","had","are","is","am",
  "page","file","document","pdf","form","section","figure","table","date",
  "number","name","type","total","item","items","shall","may","must","per",
  "each","such","more","very","been","being","does","did","done","said","using",
  "used","between","through","during","before","after","above","below",
])

function extractKeywordsLocal(text: string): string[] {
  // Tokenize, remove stopwords, count term frequency
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/)
  const freq = new Map<string, number>()

  for (const word of words) {
    const w = word.replace(/^['-]+|['-]+$/g, "")
    if (w.length < 3 || w.length > 40) continue
    if (STOP_WORDS.has(w)) continue
    if (/^\d+$/.test(w)) continue
    freq.set(w, (freq.get(w) || 0) + 1)
  }

  // Also extract multi-word phrases (bigrams)
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i].replace(/^['-]+|['-]+$/g, "")
    const b = words[i + 1].replace(/^['-]+|['-]+$/g, "")
    if (a.length < 3 || b.length < 3) continue
    if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue
    if (/^\d+$/.test(a) || /^\d+$/.test(b)) continue
    const bigram = `${a} ${b}`
    freq.set(bigram, (freq.get(bigram) || 0) + 1)
  }

  // Sort by frequency, return top 7
  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([word]) => word)
}

function generateLocalSummary(text: string, fileName: string): string {
  // Extract first few meaningful sentences as a summary
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && /[a-zA-Z]{3,}/.test(s))

  if (sentences.length === 0) {
    return `Document "${fileName}" — text extracted but no clear sentences found.`
  }

  const preview = sentences.slice(0, 5).join(" ")
  const wordCount = text.split(/\s+/).length
  return `Document "${fileName}" contains approximately ${wordCount} words. ` +
    `Preview: ${preview.slice(0, 500)}${preview.length > 500 ? "…" : ""}`
}
