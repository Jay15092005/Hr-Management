import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  supabase,
  type Resume,
  type JobDescription,
  type ResumeScore,
  type CandidateSelection,
  type InterviewConfiguration,
} from '../lib/supabase'
import InterviewScheduler from './InterviewScheduler'
import './CandidateDetail.css'

export default function CandidateDetail() {
  const { jobId, resumeId } = useParams<{ jobId: string; resumeId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resume, setResume] = useState<Resume | null>(null)
  const [job, setJob] = useState<JobDescription | null>(null)
  const [score, setScore] = useState<ResumeScore | null>(null)
  const [selection, setSelection] = useState<CandidateSelection | null>(null)
  const [interview, setInterview] = useState<InterviewConfiguration | null>(null)
  const [processing, setProcessing] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showInstantModal, setShowInstantModal] = useState(false)
  const [instantLoading, setInstantLoading] = useState(false)
  const [instantError, setInstantError] = useState<string | null>(null)
  const [instantFormData, setInstantFormData] = useState({
    interview_type: 'Python',
    difficulty_level: 'Medium' as 'Easy' | 'Medium' | 'Hard',
    duration_minutes: 60,
    coding_round: false,
  })

  const loadData = async () => {
    if (!jobId || !resumeId) return
    setError(null)
    try {
      const { data: scoreData } = await supabase
        .from('resume_scores')
        .select('*')
        .eq('resume_id', resumeId)
        .eq('job_description_id', jobId)
        .single()
      setScore(scoreData as ResumeScore | null)

      const { data: selData } = await supabase
        .from('candidate_selections')
        .select('*')
        .eq('resume_id', resumeId)
        .eq('job_description_id', jobId)
        .single()
      setSelection(selData as CandidateSelection | null)

      if (selData?.id) {
        const { data: intData } = await supabase
          .from('interview_configurations')
          .select('*')
          .eq('candidate_selection_id', selData.id)
          .single()
        setInterview(intData as InterviewConfiguration | null)
      } else {
        setInterview(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    if (!jobId || !resumeId) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: resumeData, error: rErr } = await supabase
          .from('resumes')
          .select('*')
          .eq('id', resumeId)
          .single()
        if (rErr || !resumeData) {
          setError('Candidate not found')
          setLoading(false)
          return
        }
        setResume(resumeData as Resume)

        const { data: jobData, error: jErr } = await supabase
          .from('job_descriptions')
          .select('*')
          .eq('id', jobId)
          .single()
        if (jErr || !jobData) {
          setError('Job not found')
          setLoading(false)
          return
        }
        setJob(jobData as JobDescription)

        await loadData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId, resumeId])

  const handleSelect = async () => {
    if (!jobId || !resumeId) return
    setProcessing(true)
    setError(null)
    try {
      await supabase.from('candidate_selections').upsert(
        {
          resume_id: resumeId,
          job_description_id: jobId,
          status: 'selected',
          selected_at: new Date().toISOString(),
        },
        { onConflict: 'resume_id,job_description_id' }
      )
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!jobId || !resumeId) return
    setProcessing(true)
    setError(null)
    try {
      await supabase.from('candidate_selections').upsert(
        {
          resume_id: resumeId,
          job_description_id: jobId,
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          email_sent: false,
          email_sent_at: null,
        },
        { onConflict: 'resume_id,job_description_id' }
      )
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleReset = async () => {
    if (!jobId || !resumeId || !confirm('Reset score and selection for this candidate?')) return
    setProcessing(true)
    setError(null)
    try {
      await supabase
        .from('resume_scores')
        .delete()
        .eq('resume_id', resumeId)
        .eq('job_description_id', jobId)
      await supabase
        .from('candidate_selections')
        .delete()
        .eq('resume_id', resumeId)
        .eq('job_description_id', jobId)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleScheduleInterview = () => {
    if (selection) setShowScheduleModal(true)
  }

  const handleInstantInterview = () => {
    if (selection) {
      setShowInstantModal(true)
      setInstantError(null)
      setInstantFormData({
        interview_type: 'Python',
        difficulty_level: 'Medium',
        duration_minutes: 60,
        coding_round: false,
      })
    }
  }

  const handleInstantSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selection || !jobId) return
    setInstantLoading(true)
    setInstantError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-instant-interview',
        {
          body: {
            candidate_selection_id: selection.id,
            interview_type: instantFormData.interview_type,
            difficulty_level: instantFormData.difficulty_level,
            duration_minutes: instantFormData.duration_minutes,
            coding_round: instantFormData.coding_round,
          },
        }
      )
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      if (data?.success) {
        await loadData()
        setShowInstantModal(false)
        const joinUrl = data.join_url
        if (joinUrl && confirm('Interview created. Open room now?'))
          window.open(joinUrl, '_blank')
      } else throw new Error('Failed to create instant interview')
    } catch (err) {
      setInstantError(
        err instanceof Error ? err.message : 'Failed to create instant interview'
      )
    } finally {
      setInstantLoading(false)
    }
  }

  const getScoreColor = (s: number) => {
    if (s >= 80) return '#4caf50'
    if (s >= 60) return '#ff9800'
    return '#f44336'
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (loading) {
    return (
      <div className="candidate-detail-page">
        <p className="candidate-detail-loading">Loading…</p>
      </div>
    )
  }
  if (error || !resume || !job) {
    return (
      <div className="candidate-detail-page">
        <p className="candidate-detail-error">{error || 'Not found'}</p>
        <button type="button" className="btn-back" onClick={() => navigate('/', { state: { section: 'workflow' } })}>
          ← Back to Workflow
        </button>
      </div>
    )
  }

  const isSelected = selection?.status === 'selected'
  const isRejected = selection?.status === 'rejected'
  const canSchedule = isSelected && !interview

  return (
    <div className="candidate-detail-page">
      <header className="candidate-detail-header">
        <button type="button" className="btn-back" onClick={() => navigate('/', { state: { section: 'workflow' } })}>
          ← Back to Workflow
        </button>
        <h1 className="candidate-detail-title">{resume.name}</h1>
        <p className="candidate-detail-subtitle">Candidate for: {job.title}</p>
      </header>

      {error && <div className="candidate-detail-error-inline">{error}</div>}

      <section className="candidate-detail-section candidate-detail-actions">
        <h2>Actions</h2>
        <div className="detail-actions-grid">
          {!isSelected && (
            <button
              type="button"
              className="btn-action btn-select"
              onClick={handleSelect}
              disabled={processing}
            >
              {processing ? '…' : '✓ Select candidate'}
            </button>
          )}
          {!isRejected && (
            <button
              type="button"
              className="btn-action btn-reject"
              onClick={handleReject}
              disabled={processing}
            >
              {processing ? '…' : '✗ Reject'}
            </button>
          )}
          {canSchedule && (
            <>
              <button
                type="button"
                className="btn-action btn-instant"
                onClick={handleInstantInterview}
                disabled={processing}
              >
                ⚡ Instant Interview
              </button>
              <button
                type="button"
                className="btn-action btn-schedule"
                onClick={handleScheduleInterview}
                disabled={processing}
              >
                📅 Schedule Interview
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-action btn-reset"
            onClick={handleReset}
            disabled={processing}
          >
            {processing ? '…' : '🔄 Reset (score & selection)'}
          </button>
        </div>
      </section>

      <section className="candidate-detail-section">
        <h2>Candidate info</h2>
        <dl className="detail-dl">
          <dt>Name</dt>
          <dd>{resume.name}</dd>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${resume.email}`}>{resume.email}</a>
          </dd>
          <dt>Application date</dt>
          <dd>{formatDate(resume.date_of_application)}</dd>
          {resume.years_of_experience != null && (
            <>
              <dt>Experience</dt>
              <dd>{resume.years_of_experience} years</dd>
            </>
          )}
          {resume.location && (
            <>
              <dt>Location</dt>
              <dd>{resume.location}</dd>
            </>
          )}
          {resume.degree && (
            <>
              <dt>Degree</dt>
              <dd>{resume.degree}</dd>
            </>
          )}
          <dt>Resume</dt>
          <dd>
            {resume.resume_file_url ? (
              <a
                href={resume.resume_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-resume"
              >
                View / Download resume
              </a>
            ) : (
              '—'
            )}
          </dd>
        </dl>
      </section>

      <section className="candidate-detail-section">
        <h2>Evaluation (for this job)</h2>
        {score ? (
          <>
            <div className="detail-score-row">
              <span className="label">Score</span>
              <span
                className="score-badge"
                style={{ backgroundColor: getScoreColor(score.score) }}
              >
                {score.score}/100
              </span>
            </div>
            {score.summary && (
              <div className="detail-block">
                <strong>Summary</strong>
                <p>{score.summary}</p>
              </div>
            )}
            {score.missing_skills?.length > 0 && (
              <div className="detail-block">
                <strong>Missing skills</strong>
                <ul>
                  {score.missing_skills.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="detail-empty">Not evaluated yet for this job.</p>
        )}
      </section>

      <section className="candidate-detail-section">
        <h2>Selection status</h2>
        {selection ? (
          <div className="detail-block">
            <span className={`status-badge status-${selection.status}`}>
              {selection.status === 'selected' && '✓ Selected'}
              {selection.status === 'rejected' && '✗ Rejected'}
              {selection.status === 'pending' && 'Pending'}
            </span>
            {selection.selected_at && (
              <p className="detail-muted">Selected at {formatDateTime(selection.selected_at)}</p>
            )}
            {selection.rejected_at && (
              <p className="detail-muted">Rejected at {formatDateTime(selection.rejected_at)}</p>
            )}
          </div>
        ) : (
          <p className="detail-empty">No selection yet.</p>
        )}
      </section>

      {interview && (
        <section className="candidate-detail-section">
          <h2>Interview</h2>
          <dl className="detail-dl">
            <dt>Type</dt>
            <dd>{interview.interview_type}</dd>
            <dt>Difficulty</dt>
            <dd>{interview.difficulty_level}</dd>
            <dt>Duration</dt>
            <dd>{interview.duration_minutes} min</dd>
            <dt>Coding round</dt>
            <dd>{interview.coding_round ? 'Yes' : 'No'}</dd>
            <dt>Scheduled</dt>
            <dd>{formatDateTime(interview.scheduled_at)}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`status-badge status-${interview.status}`}>{interview.status}</span>
            </dd>
          </dl>
        </section>
      )}

      {showScheduleModal && selection && (
        <InterviewScheduler
          candidateSelection={selection}
          candidateName={resume.name}
          candidateEmail={resume.email}
          jobTitle={job.title}
          onClose={() => setShowScheduleModal(false)}
          onSuccess={() => {
            loadData()
            setShowScheduleModal(false)
          }}
        />
      )}

      {showInstantModal && selection && (
        <div
          className="instant-interview-overlay"
          onClick={() => setShowInstantModal(false)}
        >
          <div
            className="instant-interview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="instant-interview-header">
              <h2>⚡ Instant Interview</h2>
              <button
                type="button"
                className="close-button"
                onClick={() => setShowInstantModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleInstantSubmit} className="instant-interview-form">
              <div className="form-group">
                <label>Candidate</label>
                <input type="text" value={resume.name} disabled className="form-input disabled" />
              </div>
              <div className="form-group">
                <label>Interview Type *</label>
                <select
                  value={instantFormData.interview_type}
                  onChange={(e) =>
                    setInstantFormData((p) => ({ ...p, interview_type: e.target.value }))
                  }
                  className="form-select"
                  required
                >
                  {['Python', 'Node.js', 'Java', 'React', 'Angular', 'Vue.js', 'Go', 'Rust', 'C++', 'Other'].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Difficulty *</label>
                  <select
                    value={instantFormData.difficulty_level}
                    onChange={(e) =>
                      setInstantFormData((p) => ({
                        ...p,
                        difficulty_level: e.target.value as 'Easy' | 'Medium' | 'Hard',
                      }))
                    }
                    className="form-select"
                    required
                  >
                    {['Easy', 'Medium', 'Hard'].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration (min) *</label>
                  <select
                    value={instantFormData.duration_minutes}
                    onChange={(e) =>
                      setInstantFormData((p) => ({
                        ...p,
                        duration_minutes: parseInt(e.target.value),
                      }))
                    }
                    className="form-select"
                    required
                  >
                    {[30, 45, 60, 90, 120].map((d) => (
                      <option key={d} value={d}>
                        {d} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={instantFormData.coding_round}
                    onChange={(e) =>
                      setInstantFormData((p) => ({ ...p, coding_round: e.target.checked }))
                    }
                    className="form-checkbox"
                  />
                  <span>Coding Round</span>
                </label>
              </div>
              <div className="instant-interview-warning">
                Creates room and sends link immediately.
              </div>
              {instantError && (
                <div className="candidate-detail-error-inline">{instantError}</div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowInstantModal(false)}
                  className="btn-cancel"
                  disabled={instantLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit-instant"
                  disabled={instantLoading}
                >
                  {instantLoading ? 'Creating…' : '⚡ Create Instant Interview'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
