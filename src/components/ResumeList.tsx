import { useEffect, useState } from 'react'
import { supabase, type Resume } from '../lib/supabase'
import ResumeFileLink from './ResumeFileLink'
import './ResumeList.css'

interface ResumeListProps {
  refreshTrigger?: number
}

type ResumeWithRoles = Resume & { jobRoles: string[] }

export default function ResumeList({ refreshTrigger }: ResumeListProps) {
  const [resumes, setResumes] = useState<ResumeWithRoles[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchResumes()
  }, [refreshTrigger])

  const fetchResumes = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .order('date_of_application', { ascending: false })

      if (error) throw error
      const rows = (data || []) as Resume[]
      if (rows.length === 0) {
        setResumes([])
        return
      }

      const resumeIds = rows.map((r) => r.id)
      const { data: selectionData, error: selectionError } = await supabase
        .from('candidate_selections')
        .select('resume_id, job_descriptions(title)')
        .in('resume_id', resumeIds)

      if (selectionError) throw selectionError

      const rolesByResume = new Map<string, Set<string>>()
      ;(selectionData || []).forEach((row: any) => {
        const resumeId = row.resume_id as string
        const title = row.job_descriptions?.title as string | undefined
        if (!resumeId || !title) return
        if (!rolesByResume.has(resumeId)) rolesByResume.set(resumeId, new Set())
        rolesByResume.get(resumeId)!.add(title)
      })

      const mapped: ResumeWithRoles[] = rows.map((r) => ({
        ...r,
        jobRoles: Array.from(rolesByResume.get(r.id) || []),
      }))
      setResumes(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch resumes')
      console.error('Error fetching resumes:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="resume-list-container">
        <div className="loading">Loading resumes...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="resume-list-container">
        <div className="error">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="resume-list-container">
      <div className="resume-list-header">
        <h1>Resume List</h1>
        <p className="subtitle">Total Resumes: {resumes.length}</p>
      </div>

      {resumes.length === 0 ? (
        <div className="empty-state">
          <p>No resumes available yet.</p>
          <p className="hint">Resumes will appear here once they are added to the system.</p>
        </div>
      ) : (
        <div className="resume-table-container">
          <table className="resume-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Job Role</th>
                <th>Date of Application</th>
                <th>Resume File</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id}>
                  <td className="name-cell">{resume.name}</td>
                  <td className="email-cell">{resume.email}</td>
                  <td className="role-cell">
                    {resume.jobRoles.length > 0 ? resume.jobRoles.join(', ') : '—'}
                  </td>
                  <td className="date-cell">{formatDate(resume.date_of_application)}</td>
                  <td className="file-cell">
                    <ResumeFileLink resume={resume} className="resume-link">
                      <>
                        {resume.resume_file_name || 'View Resume'}
                        <span className="file-icon">📄</span>
                      </>
                    </ResumeFileLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
