import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import pdf from "pdf-parse"

export async function POST(req: NextRequest) {
  let formData
  try {
    formData = await req.formData()
  } catch (error) {
    console.error("Error parsing FormData:", error)
    return NextResponse.json(
      {
        summary: "AI processing failed: Invalid request format.",
        extractedKeywords: [],
        fullExtractedText: "",
        message: "Failed to parse request data.",
      },
      { status: 400 },
    )
  }

  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json(
      {
        summary: "File is required.",
        extractedKeywords: [],
        fullExtractedText: "",
        message: "File is required for AI processing.",
      },
      { status: 400 },
    )
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      {
        summary: "Invalid file type.",
        extractedKeywords: [],
        fullExtractedText: "",
        message: "Only PDF files are supported.",
      },
      { status: 400 },
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        summary: "OpenAI API key not configured.",
        extractedKeywords: [],
        fullExtractedText: "",
        message: "OpenAI API key is not configured on the server.",
      },
      { status: 500 },
    )
  }

  try {
    // Convert File to Buffer for pdf-parse
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text from PDF using pdf-parse
    console.log("Extracting text from PDF...")
    const pdfData = await pdf(buffer)
    const extractedText = pdfData.text

    console.log(`Extracted ${extractedText.length} characters from PDF`)

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        {
          summary: "No text could be extracted from this PDF.",
          extractedKeywords: [],
          fullExtractedText: "",
          message: "PDF appears to be empty or contains only images/scanned content.",
        },
        { status: 400 },
      )
    }

    // Truncate text if too long (to avoid token limits)
    const maxLength = 8000 // Adjust based on your needs
    const textToAnalyze =
      extractedText.length > maxLength
        ? extractedText.substring(0, maxLength) + "...\n[Text truncated for analysis]"
        : extractedText

    console.log("Sending to OpenAI for analysis...")

    // Generate summary from actual extracted text
    const summaryResult = await generateText({
      model: openai("gpt-4o"),
      system: "You are an expert document analyst. Create concise, professional summaries.",
      prompt: `Please provide a brief professional summary (2-3 sentences) of this document:\n\n${textToAnalyze}`,
    })

    // Extract keywords from actual text
    const keywordsResult = await generateText({
      model: openai("gpt-4o"),
      system: `You are an expert at identifying specific, relevant keywords from documents. 
      
IMPORTANT RULES:
- Extract SPECIFIC terms from the actual text, not generic ones
- Focus on domain-specific terminology, proper nouns, and key concepts
- Include technical terms, company names, product names, important metrics
- Avoid generic words like: document, content, analysis, extract, keywords, text, information, data
- Return exactly 5-8 keywords as comma-separated values
- Base keywords on the ACTUAL content provided`,
      prompt: `Extract 5-8 SPECIFIC, relevant keywords from this actual document text. Focus on technical terms, proper nouns, key concepts, and domain-specific language found in the text:\n\n${textToAnalyze}`,
    })

    const extractedKeywords = keywordsResult.text
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k && k.length > 2)
      .filter((k) => {
        const lower = k.toLowerCase()
        const genericTerms = [
          "document",
          "content",
          "analysis",
          "extract",
          "keywords",
          "text",
          "information",
          "data",
          "file",
          "section",
          "details",
          "overview",
          "summary",
          "report",
          "document type",
          "page",
          "chapter",
        ]
        return !genericTerms.includes(lower)
      })
      .slice(0, 8)

    return NextResponse.json({
      summary: summaryResult.text,
      extractedKeywords,
      fullExtractedText: extractedText, // Return the ACTUAL extracted text
      message: `Successfully extracted ${extractedText.length} characters and processed with AI.`,
    })
  } catch (error) {
    console.error("PDF processing error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"

    // Handle specific pdf-parse errors
    if (message.includes("Invalid PDF")) {
      return NextResponse.json(
        {
          summary: "Invalid PDF file format.",
          extractedKeywords: [],
          fullExtractedText: "",
          message: "The uploaded file is not a valid PDF or is corrupted.",
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        summary: `Processing failed: ${message}`,
        extractedKeywords: [],
        fullExtractedText: "",
        message: `PDF processing failed: ${message}`,
      },
      { status: 500 },
    )
  }
}

export const runtime = "nodejs"
