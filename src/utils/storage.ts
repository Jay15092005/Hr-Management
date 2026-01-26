import { supabase, RESUMES_BUCKET } from '../lib/supabase'

/**
 * Storage utility functions for resume files
 */

export interface UploadResult {
  success: boolean
  path?: string
  url?: string
  error?: string
}

/**
 * Upload a resume file to Supabase Storage
 * @param file - The file to upload
 * @param candidateName - Name of the candidate (used for file naming)
 * @returns Upload result with path and public URL
 */
export async function uploadResume(
  file: File,
  candidateName: string
): Promise<UploadResult> {
  try {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]

    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.',
      }
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: 'File size exceeds 50MB limit.',
      }
    }

    // Generate unique file path
    const fileExt = file.name.split('.').pop()
    const sanitizedName = candidateName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const timestamp = Date.now()
    const filePath = `${sanitizedName}_${timestamp}.${fileExt}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(RESUMES_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return {
        success: false,
        error: error.message || 'Failed to upload file',
      }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(RESUMES_BUCKET)
      .getPublicUrl(data.path)

    return {
      success: true,
      path: data.path,
      url: urlData.publicUrl,
    }
  } catch (error) {
    console.error('Upload error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Delete a resume file from Supabase Storage
 * @param filePath - Path of the file to delete
 * @returns Success status
 */
export async function deleteResume(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(RESUMES_BUCKET)
      .remove([filePath])

    if (error) {
      console.error('Storage delete error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Delete error:', error)
    return false
  }
}

/**
 * Get public URL for a resume file
 * @param filePath - Path of the file in storage
 * @returns Public URL
 */
export function getResumeUrl(filePath: string): string {
  const { data } = supabase.storage
    .from(RESUMES_BUCKET)
    .getPublicUrl(filePath)
  return data.publicUrl
}
