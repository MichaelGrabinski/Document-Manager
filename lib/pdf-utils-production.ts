import pdf from "pdf-parse"

export interface PDFExtractionResult {
  text: string
  numPages: number
  info: any
  metadata: any
}

export async function extractTextFromPDF(file: File): Promise<PDFExtractionResult> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const data = await pdf(buffer)

    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      metadata: data.metadata,
    }
  } catch (error) {
    console.error("PDF extraction error:", error)
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export function truncateText(text: string, maxLength = 8000): string {
  if (text.length <= maxLength) {
    return text
  }

  return text.substring(0, maxLength) + "...\n[Text truncated for analysis]"
}

export function cleanExtractedText(text: string): string {
  // Remove excessive whitespace and normalize line breaks
  return text
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, "\n") // Remove empty lines
    .trim()
}
