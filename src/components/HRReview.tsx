import { useState, useEffect } from 'react'
import { supabase, type CandidateWithScore, type JobDescription, type InterviewConfiguration } from '../lib/supabase'
import { sendSelectionEmail } from '../utils/email'
import InterviewScheduler from './InterviewScheduler'
import './HRReview.css'

interface HRReviewProps {
  jobDescription: JobDescription | null
  compact?: boolean
}

export default function HRReview({ jobDescription, compact = false }: HRReviewProps) {
  const [candidates, setCandidates] = useState<CandidateWithScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [schedulingCandidate, setSchedulingCandidate] = useState<CandidateWithScore | null>(null)
  const [instantInterviewCandidate, setInstantInterviewCandidate] = useState<CandidateWithScore | null>(null)
  const [instantInterviewLoading, setInstantInterviewLoading] = useState(false)
  const [instantInterviewError, setInstantInterviewError] = useState<string | null>(null)
  const [instantInterviewFormData, setInstantInterviewFormData] = useState({
    interview_type: 'Python',
    difficulty_level: 'Medium' as 'Easy' | 'Medium' | 'Hard',
    duration_minutes: 60,
    coding_round: false,
  })

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
            must_have_matched_skills: score.must_have_matched_skills ?? [],
            nice_to_have_matched_skills: score.nice_to_have_matched_skills ?? [],
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

  const handleInstantInterview = (candidate: CandidateWithScore) => {
    if (!candidate.selection) return
    setInstantInterviewCandidate(candidate)
    setInstantInterviewError(null)
    setInstantInterviewFormData({
      interview_type: 'Python',
      difficulty_level: 'Medium',
      duration_minutes: 60,
      coding_round: false,
    })
  }

  const handleInstantInterviewClose = () => {
    setInstantInterviewCandidate(null)
    setInstantInterviewError(null)
  }

  const handleInstantInterviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!instantInterviewCandidate || !instantInterviewCandidate.selection || !jobDescription) return

    setInstantInterviewLoading(true)
    setInstantInterviewError(null)

    try {
      // Call the instant interview edge function
      const { data, error } = await supabase.functions.invoke('create-instant-interview', {
        body: {
          candidate_selection_id: instantInterviewCandidate.selection.id,
          interview_type: instantInterviewFormData.interview_type,
          difficulty_level: instantInterviewFormData.difficulty_level,
          duration_minutes: instantInterviewFormData.duration_minutes,
          coding_round: instantInterviewFormData.coding_round,
        },
      })

      if (error) {
        throw error
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      if (data?.success) {
        // Refresh candidates list
        await fetchCandidatesWithScores()
        
        // Show success message and optionally open interview room
        const joinUrl = data.join_url
        const shouldOpen = confirm(
          `Instant interview created successfully!\n\nInterview link sent to ${instantInterviewCandidate.email}\n\nWould you like to open the interview room now?`
        )
        
        if (shouldOpen && joinUrl) {
          window.open(joinUrl, '_blank')
        }
        
        handleInstantInterviewClose()
      } else {
        throw new Error('Failed to create instant interview')
      }
    } catch (err) {
      console.error('Error creating instant interview:', err)
      setInstantInterviewError(err instanceof Error ? err.message : 'Failed to create instant interview')
    } finally {
      setInstantInterviewLoading(false)
    }
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

  if (compact) {
    return (
      <div className="hr-review-container compact">
        <h2 className="section-title">Person Name</h2>
        {candidates.length === 0 ? (
          <p className="empty-msg">No candidates evaluated yet. Evaluate resumes above.</p>
        ) : (
          <div className="candidates-list-compact">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="candidate-row-compact">
                <a
                  href={candidate.resume_file_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-view-resume-show"
                >
                  View Resume show
                </a>
                {candidate.score ? (
                  <span
                    className="score-badge-compact"
                    style={{ backgroundColor: getScoreColor(candidate.score.score) }}
                  >
                    {candidate.score.score}/100
                  </span>
                ) : (
                  <span className="score-placeholder">—/100</span>
                )}
                <button
                  type="button"
                  className="btn-view-more"
                  onClick={() => setExpandedId(expandedId === candidate.id ? null : candidate.id)}
                >
                  {expandedId === candidate.id ? 'Hide' : 'View more'}
                </button>
                {expandedId === candidate.id && (
                  <div className="candidate-expanded">
                    <p className="candidate-email">{candidate.email}</p>
                    <div className="detail-item">
                      <span className="label">Application Date:</span>
                      <span className="value">{formatDate(candidate.date_of_application)}</span>
                    </div>
                    {candidate.years_of_experience != null && (
                      <div className="detail-item">
                        <span className="label">Experience:</span>
                        <span className="value">{candidate.years_of_experience} years</span>
                      </div>
                    )}
                    {candidate.score?.summary && (
                      <div className="score-summary">
                        <strong>Summary:</strong> {candidate.score.summary}
                      </div>
                    )}
                    <div className="action-buttons-expanded">
                      {candidate.selection?.status === 'selected' ? (
                        <>
                          <span className="status-badge selected">✓ Selected</span>
                          {!candidate.interview && (
                            <>
                              <button
                                onClick={() => handleInstantInterview(candidate)}
                                className="btn-instant-interview"
                                disabled={processing === candidate.id}
                              >
                                ⚡ Instant Interview
                              </button>
                              <button
                                onClick={() => handleScheduleInterview(candidate)}
                                className="btn-schedule"
                                disabled={processing === candidate.id}
                              >
                                📅 Schedule
                              </button>
                            </>
                          )}
                          <button onClick={() => handleResetSelection(candidate)} className="btn-reset" disabled={processing === candidate.id}>
                            🔄 Reset
                          </button>
                        </>
                      ) : candidate.selection?.status === 'rejected' ? (
                        <>
                          <span className="status-badge rejected">✗ Rejected</span>
                          <button onClick={() => handleResetSelection(candidate)} className="btn-reset" disabled={processing === candidate.id}>
                            🔄 Reset
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleSelect(candidate)} className="btn-select" disabled={processing === candidate.id}>
                            {processing === candidate.id ? '...' : '✓ Select'}
                          </button>
                          <button onClick={() => handleReject(candidate)} className="btn-reject" disabled={processing === candidate.id}>
                            ✗ Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
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
        {instantInterviewCandidate && instantInterviewCandidate.selection && (
          <div className="instant-interview-overlay" onClick={handleInstantInterviewClose}>
            <div className="instant-interview-modal" onClick={(e) => e.stopPropagation()}>
              <div className="instant-interview-header">
                <h2>⚡ Instant Interview</h2>
                <button className="close-button" onClick={handleInstantInterviewClose} type="button">×</button>
              </div>
              <form onSubmit={handleInstantInterviewSubmit} className="instant-interview-form">
                <div className="form-group">
                  <label>Candidate</label>
                  <input type="text" value={instantInterviewCandidate.name} disabled className="form-input disabled" />
                </div>
                <div className="form-group">
                  <label>Interview Type *</label>
                  <select
                    value={instantInterviewFormData.interview_type}
                    onChange={(e) => setInstantInterviewFormData((p) => ({ ...p, interview_type: e.target.value }))}
                    className="form-select"
                    required
                  >
                    {['Python', 'Node.js', 'Java', 'React', 'Angular', 'Vue.js', 'Go', 'Rust', 'C++', 'Other'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Difficulty *</label>
                    <select
                      value={instantInterviewFormData.difficulty_level}
                      onChange={(e) => setInstantInterviewFormData((p) => ({ ...p, difficulty_level: e.target.value as 'Easy' | 'Medium' | 'Hard' }))}
                      className="form-select"
                      required
                    >
                      {['Easy', 'Medium', 'Hard'].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Duration (min) *</label>
                    <select
                      value={instantInterviewFormData.duration_minutes}
                      onChange={(e) => setInstantInterviewFormData((p) => ({ ...p, duration_minutes: parseInt(e.target.value) }))}
                      className="form-select"
                      required
                    >
                      {[30, 45, 60, 90, 120].map((d) => (
                        <option key={d} value={d}>{d} min</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={instantInterviewFormData.coding_round}
                      onChange={(e) => setInstantInterviewFormData((p) => ({ ...p, coding_round: e.target.checked }))}
                      className="form-checkbox"
                    />
                    <span>Coding Round</span>
                  </label>
                </div>
                <div className="instant-interview-warning">
                  This will create an interview room and send the link immediately.
                </div>
                {instantInterviewError && <div className="error-message">{instantInterviewError}</div>}
                <div className="form-actions">
                  <button type="button" onClick={handleInstantInterviewClose} className="btn-cancel" disabled={instantInterviewLoading}>Cancel</button>
                  <button type="submit" className="btn-submit-instant" disabled={instantInterviewLoading}>
                    {instantInterviewLoading ? 'Creating...' : '⚡ Create Instant Interview'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
                        <div className="action-buttons-group">
                          <button
                            onClick={() => handleInstantInterview(candidate)}
                            className="btn-instant-interview"
                            disabled={processing === candidate.id}
                            title="Start instant interview - send link immediately"
                          >
                            ⚡ Instant Interview
                          </button>
                          <button
                            onClick={() => handleScheduleInterview(candidate)}
                            className="btn-schedule"
                            disabled={processing === candidate.id}
                            title="Schedule interview for this candidate"
                          >
                            📅 Schedule Interview
                          </button>
                        </div>
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

      {instantInterviewCandidate && instantInterviewCandidate.selection && (
        <div className="instant-interview-overlay" onClick={handleInstantInterviewClose}>
          <div className="instant-interview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="instant-interview-header">
              <h2>⚡ Instant Interview</h2>
              <button className="close-button" onClick={handleInstantInterviewClose} type="button">
                ×
              </button>
            </div>

            <form onSubmit={handleInstantInterviewSubmit} className="instant-interview-form">
              <div className="form-group">
                <label htmlFor="instant-candidate-name">Candidate</label>
                <input
                  id="instant-candidate-name"
                  type="text"
                  value={instantInterviewCandidate.name}
                  disabled
                  className="form-input disabled"
                />
              </div>

              <div className="form-group">
                <label htmlFor="instant-interview-type">Interview Type *</label>
                <select
                  id="instant-interview-type"
                  value={instantInterviewFormData.interview_type}
                  onChange={(e) => setInstantInterviewFormData((prev) => ({ ...prev, interview_type: e.target.value }))}
                  className="form-select"
                  required
                >
                  {['Python', 'Node.js', 'Java', 'React', 'Angular', 'Vue.js', 'Go', 'Rust', 'C++', 'Other'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="instant-difficulty-level">Difficulty Level *</label>
                  <select
                    id="instant-difficulty-level"
                    value={instantInterviewFormData.difficulty_level}
                    onChange={(e) => setInstantInterviewFormData((prev) => ({ ...prev, difficulty_level: e.target.value as 'Easy' | 'Medium' | 'Hard' }))}
                    className="form-select"
                    required
                  >
                    {['Easy', 'Medium', 'Hard'].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="instant-duration">Duration (minutes) *</label>
                  <select
                    id="instant-duration"
                    value={instantInterviewFormData.duration_minutes}
                    onChange={(e) => setInstantInterviewFormData((prev) => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    className="form-select"
                    required
                  >
                    {[30, 45, 60, 90, 120].map((duration) => (
                      <option key={duration} value={duration}>
                        {duration} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={instantInterviewFormData.coding_round}
                    onChange={(e) => setInstantInterviewFormData((prev) => ({ ...prev, coding_round: e.target.checked }))}
                    className="form-checkbox"
                  />
                  <span>Coding Round</span>
                </label>
              </div>

              <div className="instant-interview-warning">
                ⚠️ This will create an interview room immediately and send the interview link to the candidate right away.
              </div>

              {instantInterviewError && <div className="error-message">{instantInterviewError}</div>}

              <div className="form-actions">
                <button type="button" onClick={handleInstantInterviewClose} className="btn-cancel" disabled={instantInterviewLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit-instant" disabled={instantInterviewLoading}>
                  {instantInterviewLoading ? 'Creating...' : '⚡ Create Instant Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
