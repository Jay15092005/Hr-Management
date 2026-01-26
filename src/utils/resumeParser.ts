/**
 * Utility to extract text from resume files
 * Note: This is a basic implementation. For production, consider using
 * libraries like pdf-parse for PDFs or mammoth for DOCX files
 */

/**
 * Extract text from a resume file
 * This is a simplified version - in production, you'd want to use
 * proper PDF/DOCX parsing libraries
 */
export async function extractResumeText(file: File): Promise<string> {
  const fileType = file.type

  if (fileType === 'text/plain') {
    // Plain text file
    return await file.text()
  } else if (fileType === 'application/pdf') {
    // PDF file - would need pdf-parse library
    // For now, return placeholder
    throw new Error(
      'PDF parsing requires additional setup. Please use a text file or DOCX for now.'
    )
  } else if (
    fileType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    // DOCX file - would need mammoth library
    throw new Error(
      'DOCX parsing requires additional setup. Please use a text file for now.'
    )
  } else {
    throw new Error(`Unsupported file type: ${fileType}`)
  }
}

/**
 * Extract text from a resume URL (for already uploaded files)
 * This would fetch the file and extract text
 */
export async function extractResumeTextFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch resume: ${response.statusText}`)
    }

    const blob = await response.blob()
    const file = new File([blob], 'resume', { type: blob.type })

    return await extractResumeText(file)
  } catch (error) {
    console.error('Error extracting text from URL:', error)
    throw error
  }
}
