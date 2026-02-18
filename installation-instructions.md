# Document Manager App - Production Setup

## Prerequisites
- Node.js 18+ installed
- OpenAI API key

## Installation Steps

1. **Download and extract the code from v0**
   - Click "Download Code" button in v0
   - Extract the ZIP file to your desired location

2. **Install dependencies**
   \`\`\`bash
   cd document-manager-app
   npm install
   
   # Install the PDF parsing library
   npm install pdf-parse
   npm install @types/pdf-parse --save-dev
   \`\`\`

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   \`\`\`
   OPENAI_API_KEY=your_openai_api_key_here
   \`\`\`

4. **Update the API route**
   - Rename `app/api/ai-process-production/route.ts` to `app/api/ai-process/route.ts`
   - This will replace the demo version with the production version

5. **Run the application**
   \`\`\`bash
   npm run dev
   \`\`\`

6. **Test with real PDFs**
   - Upload a PDF document
   - The app will now extract REAL text from your PDFs
   - View the actual extracted text in Test Mode
   - Keywords will be based on actual document content

## Alternative PDF Libraries

If you want to try different PDF parsing approaches:

### Option 1: PDF.js (Mozilla's library)
\`\`\`bash
npm install pdfjs-dist
\`\`\`

### Option 2: PDF2PIC (for image-based PDFs)
\`\`\`bash
npm install pdf2pic
npm install sharp  # Required for image processing
\`\`\`

### Option 3: Hummus Recipe (advanced PDF manipulation)
\`\`\`bash
npm install hummus-recipe
\`\`\`

## Troubleshooting

- **"Invalid PDF" errors**: The PDF might be corrupted or password-protected
- **Empty text extraction**: The PDF might be image-based (scanned document)
- **Token limit errors**: Large PDFs are automatically truncated for AI analysis
- **Memory issues**: Very large PDFs might need streaming processing

## Production Considerations

- Add file size limits (currently handles up to ~10MB)
- Implement proper error logging
- Add rate limiting for API calls
- Consider using a queue system for large file processing
- Add support for password-protected PDFs
- Implement OCR for scanned documents
\`\`\`

The production version will:
1. **Extract REAL text** from your PDFs using `pdf-parse`
2. **Generate keywords** based on actual document content
3. **Show actual extracted text** in the full text viewer
4. **Handle PDF errors** properly (corrupted files, empty PDFs, etc.)
5. **Manage large files** with text truncation for AI analysis

When you download and run this locally, you'll see the real PDF content instead of simulated text!
