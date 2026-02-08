/**
 * Utility to extract text from resume files (PDF, DOCX, TXT)
 * Uses pdfjs-dist for PDFs and mammoth for DOCX files
 */
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

// Set the PDF.js worker source from the installed package
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

/**
 * Extract text from a PDF ArrayBuffer using pdfjs-dist
 */
async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings = content.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str)
    pages.push(strings.join(' '))
  }

  return pages.join('\n\n')
}

/**
 * Extract text from a DOCX ArrayBuffer using mammoth
 */
async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return result.value
}

/**
 * Detect file type from MIME type or filename extension
 */
function detectFileType(
  mimeType: string,
  fileName?: string
): 'pdf' | 'docx' | 'txt' | 'unknown' {
  // Check MIME type first
  if (mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx'
  if (mimeType === 'text/plain') return 'txt'

  // Fallback to extension
  const ext = (fileName || '').split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'txt') return 'txt'

  return 'unknown'
}

/**
 * Extract text from a resume File object
 */
export async function extractResumeText(file: File): Promise<string> {
  const fileType = detectFileType(file.type, file.name)

  if (fileType === 'txt') {
    return await file.text()
  } else if (fileType === 'pdf') {
    const buffer = await file.arrayBuffer()
    return await extractPdfText(buffer)
  } else if (fileType === 'docx') {
    const buffer = await file.arrayBuffer()
    return await extractDocxText(buffer)
  } else {
    throw new Error(
      `Unsupported file type: ${file.type || 'unknown'}. Please upload a PDF, DOCX, or TXT file.`
    )
  }
}

/**
 * Extract text from a resume URL (for already uploaded files in Supabase storage)
 */
export async function extractResumeTextFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch resume: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()

    // Try to get filename from URL path (strip query params)
    const urlPath = new URL(url).pathname
    const fileName = urlPath.split('/').pop() || ''

    const fileType = detectFileType(contentType, fileName)

    if (fileType === 'pdf') {
      return await extractPdfText(buffer)
    } else if (fileType === 'docx') {
      return await extractDocxText(buffer)
    } else if (fileType === 'txt') {
      const decoder = new TextDecoder('utf-8')
      return decoder.decode(buffer)
    } else {
      // Last resort: try PDF first (most common resume format), then DOCX
      try {
        return await extractPdfText(buffer)
      } catch {
        try {
          return await extractDocxText(buffer)
        } catch {
          throw new Error(
            'Could not determine file type. Please upload a PDF, DOCX, or TXT file.'
          )
        }
      }
    }
  } catch (error) {
    console.error('Error extracting text from URL:', error)
    throw error
  }
}
