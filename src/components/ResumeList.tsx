import { useEffect, useState } from 'react'
import { supabase, type Resume } from '../lib/supabase'
import './ResumeList.css'

interface ResumeListProps {
  refreshTrigger?: number
}

export default function ResumeList({ refreshTrigger }: ResumeListProps) {
  const [resumes, setResumes] = useState<Resume[]>([])
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
      setResumes(data || [])
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
                <th>Date of Application</th>
                <th>Resume File</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id}>
                  <td className="name-cell">{resume.name}</td>
                  <td className="email-cell">{resume.email}</td>
                  <td className="date-cell">{formatDate(resume.date_of_application)}</td>
                  <td className="file-cell">
                    {resume.resume_file_url ? (
                      <a
                        href={resume.resume_file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="resume-link"
                      >
                        {resume.resume_file_name || 'View Resume'}
                        <span className="file-icon">📄</span>
                      </a>
                    ) : (
                      <span className="no-file">No file uploaded</span>
                    )}
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
