import { createClient } from '@supabase/supabase-js'

// Get environment variables (Vite requires VITE_ prefix)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Resume {
  id: string
  name: string
  email: string
  date_of_application: string
  resume_file_url: string | null
  resume_file_name: string | null
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
  created_at: string
  updated_at: string
}

export interface ResumeScore {
  id: string
  resume_id: string
  job_description_id: string
  score: number
  missing_skills: string[]
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

/**
 * Get public URL for a resume file stored in Supabase Storage
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
