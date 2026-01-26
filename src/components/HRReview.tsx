import { useState, useEffect } from 'react'
import { supabase, type CandidateWithScore, type JobDescription, type InterviewConfiguration } from '../lib/supabase'
import { sendSelectionEmail } from '../utils/email'
import InterviewScheduler from './InterviewScheduler'
import './HRReview.css'

interface HRReviewProps {
  jobDescription: JobDescription | null
}

export default function HRReview({ jobDescription }: HRReviewProps) {
  const [candidates, setCandidates] = useState<CandidateWithScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [schedulingCandidate, setSchedulingCandidate] = useState<CandidateWithScore | null>(null)

  useEffect(() => {
    if (jobDescription) {
      fetchCandidatesWithScores()
    }
  }, [jobDescription])

  const fetchCandidatesWithScores = async () => {
    if (!jobDescription) return

    try {
      setLoading(true)
      setError(null)

      // Fetch resumes with their scores for this job description
      const { data: scores, error: scoresError } = await supabase
        .from('resume_scores')
        .select(`
          *,
          resumes (
            id,
            name,
            email,
            date_of_application,
            resume_file_url,
            resume_file_name,
            years_of_experience,
            location,
            degree
          )
        `)
        .eq('job_description_id', jobDescription.id)
        .order('score', { ascending: false })

      if (scoresError) throw scoresError

      // Fetch selection status
      const { data: selections, error: selectionsError } = await supabase
        .from('candidate_selections')
        .select('*')
        .eq('job_description_id', jobDescription.id)

      if (selectionsError) throw selectionsError

      // Fetch interview configurations
      const selectionIds = selections?.map((s) => s.id) || []
      let interviews: InterviewConfiguration[] = []
      if (selectionIds.length > 0) {
        const { data: interviewData, error: interviewError } = await supabase
          .from('interview_configurations')
          .select('*')
          .in('candidate_selection_id', selectionIds)

        if (interviewError) {
          console.error('Error fetching interviews:', interviewError)
        } else {
          interviews = interviewData || []
        }
      }

      // Combine data
      const candidatesData: CandidateWithScore[] = (scores || []).map((score: any) => {
        const resume = score.resumes
        const selection = selections?.find((s) => s.resume_id === resume.id)
        const interview = selection
          ? interviews.find((i) => i.candidate_selection_id === selection.id)
          : undefined
        return {
          ...resume,
          score: {
            id: score.id,
            resume_id: score.resume_id,
            job_description_id: score.job_description_id,
            score: score.score,
            missing_skills: score.missing_skills || [],
            summary: score.summary,
            resume_text: score.resume_text,
            evaluated_at: score.evaluated_at,
            created_at: score.created_at,
          },
          selection,
          interview,
        }
      })

      setCandidates(candidatesData)
    } catch (err) {
      console.error('Error fetching candidates:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (candidate: CandidateWithScore) => {
    if (!jobDescription) return

    setProcessing(candidate.id)
    setError(null)

    try {
      // Update or create selection record
      const { error: selectionError } = await supabase
        .from('candidate_selections')
        .upsert(
          {
            resume_id: candidate.id,
            job_description_id: jobDescription.id,
            status: 'selected',
            selected_at: new Date().toISOString(),
          },
          {
            onConflict: 'resume_id,job_description_id',
          }
        )

      if (selectionError) throw selectionError

      // Note: Email 1 will be sent when interview is scheduled
      // We don't send email here anymore - it's sent from InterviewScheduler

      // Email will be sent when interview is scheduled

      // Refresh data
      await fetchCandidatesWithScores()
    } catch (err) {
      console.error('Error selecting candidate:', err)
      setError(err instanceof Error ? err.message : 'Failed to select candidate')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (candidate: CandidateWithScore) => {
    if (!jobDescription) return

    setProcessing(candidate.id)
    setError(null)

    try {
      const { error } = await supabase
        .from('candidate_selections')
        .upsert(
          {
            resume_id: candidate.id,
            job_description_id: jobDescription.id,
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            email_sent: false, // Reset email status on reject
            email_sent_at: null,
          },
          {
            onConflict: 'resume_id,job_description_id',
          }
        )

      if (error) throw error

      await fetchCandidatesWithScores()
    } catch (err) {
      console.error('Error rejecting candidate:', err)
      setError(err instanceof Error ? err.message : 'Failed to reject candidate')
    } finally {
      setProcessing(null)
    }
  }

  const handleResetSelection = async (candidate: CandidateWithScore) => {
    if (!jobDescription) return

    if (!confirm(`Reset selection for ${candidate.name}? This will clear the selection and email status.`)) {
      return
    }

    setProcessing(candidate.id)
    setError(null)

    try {
      const { error } = await supabase
        .from('candidate_selections')
        .delete()
        .eq('resume_id', candidate.id)
        .eq('job_description_id', jobDescription.id)

      if (error) throw error

      await fetchCandidatesWithScores()
    } catch (err) {
      console.error('Error resetting selection:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset selection')
    } finally {
      setProcessing(null)
    }
  }

  const handleResetAll = async () => {
    if (!jobDescription) return

    if (!confirm('Reset all selections? This will clear all selection and email statuses for this job.')) {
      return
    }

    setProcessing('all')
    setError(null)

    try {
      const { error } = await supabase
        .from('candidate_selections')
        .delete()
        .eq('job_description_id', jobDescription.id)

      if (error) throw error

      await fetchCandidatesWithScores()
    } catch (err) {
      console.error('Error resetting all:', err)
      setError(err instanceof Error ? err.message : 'Failed to reset all selections')
    } finally {
      setProcessing(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleScheduleInterview = (candidate: CandidateWithScore) => {
    if (!candidate.selection) return
    setSchedulingCandidate(candidate)
  }

  const handleSchedulingClose = () => {
    setSchedulingCandidate(null)
  }

  const handleSchedulingSuccess = () => {
    fetchCandidatesWithScores()
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4caf50'
    if (score >= 60) return '#ff9800'
    return '#f44336'
  }

  if (!jobDescription) {
    return (
      <div className="hr-review-container">
        <div className="info-message">
          Please select a job description to review candidates
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="hr-review-container">
        <div className="loading">Loading candidates...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="hr-review-container">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  return (
    <div className="hr-review-container">
      <div className="review-header">
        <div className="header-content">
          <div>
            <h2>HR Review & Selection</h2>
            <p className="review-subtitle">
              Review candidates for: <strong>{jobDescription.title}</strong>
            </p>
            <p className="review-count">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} evaluated
            </p>
          </div>
          {candidates.some((c) => c.selection) && (
            <button
              onClick={handleResetAll}
              className="btn-reset-all"
              disabled={processing === 'all'}
            >
              {processing === 'all' ? 'Resetting...' : '🔄 Reset All Selections'}
            </button>
          )}
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="empty-state">
          <p>No candidates evaluated yet. Please evaluate resumes first.</p>
        </div>
      ) : (
        <div className="candidates-list">
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              className={`candidate-card ${candidate.selection?.status || ''}`}
            >
              <div className="candidate-header">
                <div className="candidate-info">
                  <h3>{candidate.name}</h3>
                  <p className="candidate-email">{candidate.email}</p>
                </div>
                {candidate.score && (
                  <div
                    className="score-badge"
                    style={{ backgroundColor: getScoreColor(candidate.score.score) }}
                  >
                    {candidate.score.score}/100
                  </div>
                )}
              </div>

              <div className="candidate-details">
                <div className="detail-item">
                  <span className="label">Application Date:</span>
                  <span className="value">
                    {formatDate(candidate.date_of_application)}
                  </span>
                </div>
                {candidate.years_of_experience && (
                  <div className="detail-item">
                    <span className="label">Experience:</span>
                    <span className="value">{candidate.years_of_experience} years</span>
                  </div>
                )}
                {candidate.location && (
                  <div className="detail-item">
                    <span className="label">Location:</span>
                    <span className="value">{candidate.location}</span>
                  </div>
                )}
                {candidate.score?.summary && (
                  <div className="score-summary">
                    <strong>Summary:</strong> {candidate.score.summary}
                  </div>
                )}
                {candidate.interview && (
                  <div className="interview-info">
                    <div className="interview-header">
                      <strong>📅 Interview Scheduled</strong>
                      <span className={`interview-status ${candidate.interview.status}`}>
                        {candidate.interview.status}
                      </span>
                    </div>
                    <div className="interview-details">
                      <div className="detail-item">
                        <span className="label">Type:</span>
                        <span className="value">{candidate.interview.interview_type}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Difficulty:</span>
                        <span className="value">{candidate.interview.difficulty_level}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Duration:</span>
                        <span className="value">{candidate.interview.duration_minutes} minutes</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Coding Round:</span>
                        <span className="value">{candidate.interview.coding_round ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Scheduled:</span>
                        <span className="value">{formatDateTime(candidate.interview.scheduled_at)}</span>
                      </div>
                      {candidate.interview.room_id && (
                        <div className="detail-item">
                          <span className="label">Room ID:</span>
                          <span className="value">{candidate.interview.room_id}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="candidate-actions">
                <a
                  href={candidate.resume_file_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-view-resume"
                >
                  📄 View Resume
                </a>

                <div className="action-buttons">
                  {candidate.selection?.status === 'selected' ? (
                    <div className="status-actions">
                      <div className="status-badge selected">
                        ✓ Selected
                        {candidate.interview && (
                          <span className="interview-scheduled">📅 Interview Scheduled</span>
                        )}
                        {candidate.selection.email_sent && (
                          <span className="email-sent">📧 Email Sent</span>
                        )}
                      </div>
                      {!candidate.interview && (
                        <button
                          onClick={() => handleScheduleInterview(candidate)}
                          className="btn-schedule"
                          disabled={processing === candidate.id}
                          title="Schedule interview for this candidate"
                        >
                          📅 Schedule Interview
                        </button>
                      )}
                      <button
                        onClick={() => handleResetSelection(candidate)}
                        className="btn-reset"
                        disabled={processing === candidate.id}
                        title="Reset selection to try again"
                      >
                        🔄 Reset
                      </button>
                    </div>
                  ) : candidate.selection?.status === 'rejected' ? (
                    <div className="status-actions">
                      <div className="status-badge rejected">✗ Rejected</div>
                      <button
                        onClick={() => handleResetSelection(candidate)}
                        className="btn-reset"
                        disabled={processing === candidate.id}
                        title="Reset rejection"
                      >
                        🔄 Reset
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSelect(candidate)}
                        className="btn-select"
                        disabled={processing === candidate.id}
                      >
                        {processing === candidate.id ? 'Processing...' : '✓ Select'}
                      </button>
                      <button
                        onClick={() => handleReject(candidate)}
                        className="btn-reject"
                        disabled={processing === candidate.id}
                      >
                        ✗ Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {schedulingCandidate && schedulingCandidate.selection && (
        <InterviewScheduler
          candidateSelection={schedulingCandidate.selection}
          candidateName={schedulingCandidate.name}
          candidateEmail={schedulingCandidate.email}
          jobTitle={jobDescription.title}
          onClose={handleSchedulingClose}
          onSuccess={handleSchedulingSuccess}
        />
      )}
    </div>
  )
}
