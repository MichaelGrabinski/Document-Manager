declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion?: string
    IsAcroFormPresent?: boolean
    IsXFAPresent?: boolean
    Title?: string
    Author?: string
    Creator?: string
    Producer?: string
    CreationDate?: string
    ModDate?: string
    Pages?: number
  }
  interface PDFMetadata { info?: PDFInfo; metadata?: any; version?: string; text: string }
  function pdf(data: Buffer | Uint8Array, options?: any): Promise<PDFMetadata>
  export default pdf
}