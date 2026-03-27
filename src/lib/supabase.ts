import { createClient } from '@supabase/supabase-js'

// Get environment variables (Vite requires VITE_ prefix)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  )
}

/** Set by AuthProvider: Clerk session JWT for Supabase third-party auth (see Supabase + Clerk docs). */
let clerkAccessTokenGetter: () => Promise<string | null> = async () => null

export function setClerkSupabaseAccessToken(getter: () => Promise<string | null>) {
  clerkAccessTokenGetter = getter
}

/**
 * Single client for the app. Uses Clerk session tokens when signed in; `auth` namespace is not used
 * (Supabase requirement when `accessToken` is set).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: () => clerkAccessTokenGetter(),
})

export interface Resume {
  id: string
  name: string
  email: string
  date_of_application: string
  resume_file_url: string | null
  resume_file_name: string | null
  /** Path in `resumes` bucket, e.g. `{userId}/file.pdf` — used with signed URLs when bucket is private */
  storage_object_path?: string | null
  /** Owning HR (auth user id); set by DB trigger on insert */
  owner_id?: string | null
  years_of_experience: number | null
  location: string | null
  degree: string | null
  created_at: string
  updated_at: string
}

export interface JobDescription {
  id: string
  title: string
  description: string
  required_skills: string[]
  min_experience_years: number
  location: string | null
  degree_required: string | null
  is_active: boolean
  owner_id?: string | null
  created_at: string
  updated_at: string
}

export interface JobApplicationLink {
  id: string
  owner_id: string
  job_description_id: string
  title: string | null
  custom_requirements?: string | null
  additional_details?: string | null
  slug: string
  expires_at: string
  is_active: boolean
  created_at: string
  updated_at: string
  job_descriptions?: JobDescription
}

export interface ResumeScore {
  id: string
  resume_id: string
  job_description_id: string
  score: number
  missing_skills: string[]
  must_have_matched_skills?: string[]
  nice_to_have_matched_skills?: string[]
  summary: string | null
  resume_text: string | null
  evaluated_at: string
  created_at: string
}

export interface CandidateSelection {
  id: string
  resume_id: string
  job_description_id: string
  status: 'pending' | 'selected' | 'rejected'
  selected_at: string | null
  rejected_at: string | null
  email_sent: boolean
  email_sent_at: string | null
  interview_scheduled: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InterviewConfiguration {
  id: string
  candidate_selection_id: string
  interview_type: string
  difficulty_level: 'Easy' | 'Medium' | 'Hard'
  duration_minutes: number
  coding_round: boolean
  scheduled_at: string
  room_id: string | null
  room_created_at: string | null
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  join_link_email_sent: boolean
  join_link_sent_at: string | null
  created_at: string
  updated_at: string
}

export interface CandidateWithScore extends Resume {
  score?: ResumeScore
  selection?: CandidateSelection
  interview?: InterviewConfiguration
}

// Storage bucket name
export const RESUMES_BUCKET = 'resumes'

/** True if the resume row has either a legacy public URL or a private storage path */
export function resumeHasDownloadableFile(
  r: Pick<Resume, 'storage_object_path' | 'resume_file_url'>
): boolean {
  return Boolean(r.storage_object_path?.trim() || r.resume_file_url?.trim())
}

/**
 * Signed URL for private bucket objects, or legacy public URL.
 */
export async function getResumeReadableUrl(
  r: Pick<Resume, 'storage_object_path' | 'resume_file_url'>
): Promise<string | null> {
  const path = r.storage_object_path?.trim()
  if (path) {
    const { data, error } = await supabase.storage
      .from(RESUMES_BUCKET)
      .createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) {
      console.error('createSignedUrl failed:', error)
      return null
    }
    return data.signedUrl
  }
  if (r.resume_file_url?.trim()) return r.resume_file_url
  return null
}

/**
 * Get public URL for a resume file stored in Supabase Storage (legacy / public buckets only)
 */
export const getResumePublicUrl = (filePath: string): string => {
  const { data } = supabase.storage.from(RESUMES_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

/**
 * Upload a resume file to Supabase Storage
 */
export const uploadResumeFile = async (
  file: File,
  fileName: string
): Promise<{ path: string; url: string } | null> => {
  try {
    const fileExt = file.name.split('.').pop()
    const filePath = `${Date.now()}_${fileName.replace(/[^a-z0-9]/gi, '_')}.${fileExt}`

    const { data, error } = await supabase.storage
      .from(RESUMES_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      console.error('Error uploading file:', error)
      return null
    }

    const publicUrl = getResumePublicUrl(data.path)
    return { path: data.path, url: publicUrl }
  } catch (error) {
    console.error('Error uploading resume:', error)
    return null
  }
}

/**
 * Delete a resume file from Supabase Storage
 */
export const deleteResumeFile = async (filePath: string): Promise<boolean> => {
  try {
    const { error } = await supabase.storage.from(RESUMES_BUCKET).remove([filePath])
    if (error) {
      console.error('Error deleting file:', error)
      return false
    }
    return true
  } catch (error) {
    console.error('Error deleting resume:', error)
    return false
  }
}
