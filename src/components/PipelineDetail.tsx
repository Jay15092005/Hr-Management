import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './PipelineDetail.css'

/* ── helpers ── */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ── types ── */
type DetectionRow = {
  id: string
  violation_type: string
  severity: string
  confidence: number
  created_at: string
  metadata?: { attentionScore?: number }
}

interface PageData {
  /* candidate */
  resumeId: string
  name: string
  email: string
  location: string | null
  degree: string | null
  yearsExp: number | null
  resumeUrl: string | null
  resumeFileName: string | null
  appliedAt: string | null
  /* job */
  jobId: string
  jobTitle: string
  jobDescription: string
  requiredSkills: string[]
  /* score */
  score: number | null
  summary: string | null
  mustHave: string[]
  niceToHave: string[]
  missingSkills: string[]
  evaluatedAt: string | null
  /* selection */
  selectionStatus: string
  selectedAt: string | null
  rejectedAt: string | null
  emailSent: boolean
  emailSentAt: string | null
  interviewScheduled: boolean
  /* interview config */
  interviewId: string | null
  interviewType: string | null
  difficultyLevel: string | null
  durationMinutes: number | null
  codingRound: boolean
  scheduledAt: string | null
  roomId: string | null
  roomCreatedAt: string | null
  interviewStatus: string | null
  joinLinkSent: boolean
  joinLinkSentAt: string | null
  interviewCreatedAt: string | null
}

/* pipeline steps */
const STEPS = [
  'Applied',
  'Scored',
  'Selected',
  'Email Sent',
  'Interview Scheduled',
  'Link Sent',
  'Completed',
] as const

function getStepIndex(d: PageData): number {
  if (d.interviewStatus === 'completed') return 6
  if (d.joinLinkSent) return 5
  if (d.scheduledAt) return 4
  if (d.emailSent) return 3
  if (d.selectionStatus === 'selected') return 2
  if (d.score !== null) return 1
  return 0
}

export default function PipelineDetail() {
  const { selectionId } = useParams<{ selectionId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [instantLoading, setInstantLoading] = useState(false)
  const [detections, setDetections] = useState<DetectionRow[]>([])

  useEffect(() => {
    if (!selectionId) return
    load()
  }, [selectionId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      /* selection + joined resume + job */
      const { data: sel, error: selErr } = await supabase
        .from('candidate_selections')
        .select(`
          id, status, selected_at, rejected_at,
          email_sent, email_sent_at, interview_scheduled,
          resumes!inner (
            id, name, email, location, degree,
            years_of_experience, resume_file_url, resume_file_name,
            date_of_application
          ),
          job_descriptions!inner (
            id, title, description, required_skills
          )
        `)
        .eq('id', selectionId)
        .single()

      if (selErr || !sel) throw selErr || new Error('Not found')

      const resume = (sel as any).resumes
      const job = (sel as any).job_descriptions

      /* score */
      const { data: sc } = await supabase
        .from('resume_scores')
        .select('*')
        .eq('resume_id', resume.id)
        .eq('job_description_id', job.id)
        .maybeSingle()

      /* interview */
      const { data: iv } = await supabase
        .from('interview_configurations')
        .select('*')
        .eq('candidate_selection_id', selectionId!)
        .maybeSingle()

      setData({
        resumeId: resume.id,
        name: resume.name,
        email: resume.email,
        location: resume.location,
        degree: resume.degree,
        yearsExp: resume.years_of_experience,
        resumeUrl: resume.resume_file_url,
        resumeFileName: resume.resume_file_name,
        appliedAt: resume.date_of_application,
        jobId: job.id,
        jobTitle: job.title,
        jobDescription: job.description,
        requiredSkills: job.required_skills ?? [],
        score: sc?.score ?? null,
        summary: sc?.summary ?? null,
        mustHave: (sc?.must_have_matched_skills as string[]) ?? [],
        niceToHave: (sc?.nice_to_have_matched_skills as string[]) ?? [],
        missingSkills: (sc?.missing_skills as string[]) ?? [],
        evaluatedAt: sc?.evaluated_at ?? null,
        selectionStatus: sel.status,
        selectedAt: sel.selected_at,
        rejectedAt: sel.rejected_at,
        emailSent: sel.email_sent,
        emailSentAt: sel.email_sent_at,
        interviewScheduled: sel.interview_scheduled,
        interviewId: iv?.id ?? null,
        interviewType: iv?.interview_type ?? null,
        difficultyLevel: iv?.difficulty_level ?? null,
        durationMinutes: iv?.duration_minutes ?? null,
        codingRound: iv?.coding_round ?? false,
        scheduledAt: iv?.scheduled_at ?? null,
        roomId: iv?.room_id ?? null,
        roomCreatedAt: iv?.room_created_at ?? null,
        interviewStatus: iv?.status ?? null,
        joinLinkSent: iv?.join_link_email_sent ?? false,
        joinLinkSentAt: iv?.join_link_sent_at ?? null,
        interviewCreatedAt: iv?.created_at ?? null,
      })

      if (iv?.id) {
        const { data: detData } = await supabase
          .from('cheating_detections')
          .select('id, violation_type, severity, confidence, created_at, metadata')
          .eq('interview_id', iv.id)
          .order('created_at', { ascending: false })
        setDetections((detData ?? []) as DetectionRow[])
      } else {
        setDetections([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handleResetAll = async () => {
    if (!selectionId || !data) return
    if (!confirm('Reset score, selection, and interview for this candidate?')) return
    setResetLoading(true)
    setActionError(null)
    setActionMessage(null)
    try {
      // Delete score
      await supabase
        .from('resume_scores')
        .delete()
        .eq('resume_id', data.resumeId)
        .eq('job_description_id', data.jobId)

      // Delete interview configuration(s)
      await supabase
        .from('interview_configurations')
        .delete()
        .eq('candidate_selection_id', selectionId)

      // Delete selection row
      await supabase
        .from('candidate_selections')
        .delete()
        .eq('id', selectionId)

      setActionMessage('Candidate reset successfully (score, selection, and schedule cleared).')
      await load()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to reset candidate. Please try again.'
      )
    } finally {
      setResetLoading(false)
    }
  }

  const handleInstantInterview = async () => {
    if (!selectionId || !data) return
    setInstantLoading(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke(
        'create-instant-interview',
        {
          body: {
            candidate_selection_id: selectionId,
            interview_type: 'Technical Interview',
            difficulty_level: 'Medium',
            duration_minutes: 60,
            coding_round: false,
          },
        }
      )
      if (fnErr) throw fnErr
      if (fnData?.error) throw new Error(fnData.error)
      if (fnData?.success) {
        setActionMessage('Instant interview created successfully.')
        await load()
        const joinUrl = fnData.join_url as string | undefined
        if (joinUrl && confirm('Interview created. Open room now?')) {
          window.open(joinUrl, '_blank')
        }
      } else {
        throw new Error('Failed to create instant interview')
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to create instant interview. Please try again.'
      )
    } finally {
      setInstantLoading(false)
    }
  }

  /* ── render ── */
  if (loading) {
    return (
      <div className="pd-page">
        <p className="pd-loading">Loading candidate details...</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="pd-page">
        <button className="pd-back" onClick={() => navigate('/', { state: { section: 'meetings' } })}>
          Back to Meeting Details
        </button>
        <p className="pd-error">{error || 'Candidate not found.'}</p>
      </div>
    )
  }

  const stepIdx = getStepIndex(data)
  const scoreColor =
    data.score === null ? '' : data.score >= 70 ? 'high' : data.score >= 40 ? 'mid' : 'low'

  return (
    <div className="pd-page">
      {/* Back button */}
      <button
        className="pd-back"
        onClick={() => navigate('/', { state: { section: 'meetings' } })}
      >
        &larr; Back to Meeting Details
      </button>

      {actionError && <p className="pd-error-inline">{actionError}</p>}
      {actionMessage && <p className="pd-info-inline">{actionMessage}</p>}

      {/* ── Header ── */}
      <header className="pd-header">
        <div className="pd-header-left">
          <h1 className="pd-name">{data.name}</h1>
          <p className="pd-email">{data.email}</p>
          <p className="pd-job">
            Applied for <strong>{data.jobTitle}</strong>
          </p>
        </div>
        <div className="pd-header-right">
          {data.score !== null && (
            <div className={`pd-score-circle ${scoreColor}`}>
              <span className="pd-score-num">{data.score}</span>
              <span className="pd-score-label">Score</span>
            </div>
          )}
          <span className={`pd-status-badge pd-status-${data.selectionStatus}`}>
            {data.selectionStatus}
          </span>
        </div>
      </header>

      {/* ── Pipeline progress ── */}
      <section className="pd-section">
        <h2 className="pd-section-title">Pipeline Progress</h2>
        <div className="pd-pipeline">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`pd-step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}`}
            >
              <div className="pd-step-dot">{i <= stepIdx ? '✓' : i + 1}</div>
              <div className="pd-step-label">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Two-column layout ── */}
      <div className="pd-grid">
        {/* ── LEFT COLUMN ── */}
        <div className="pd-col">
          {/* Candidate info */}
          <section className="pd-card">
            <h3 className="pd-card-title">Candidate Information</h3>
            <table className="pd-info-table">
              <tbody>
                <tr>
                  <td>Full Name</td>
                  <td>{data.name}</td>
                </tr>
                <tr>
                  <td>Email</td>
                  <td>
                    <a href={`mailto:${data.email}`}>{data.email}</a>
                  </td>
                </tr>
                <tr>
                  <td>Location</td>
                  <td>{data.location || '—'}</td>
                </tr>
                <tr>
                  <td>Degree</td>
                  <td>{data.degree || '—'}</td>
                </tr>
                <tr>
                  <td>Experience</td>
                  <td>{data.yearsExp != null ? `${data.yearsExp} years` : '—'}</td>
                </tr>
                <tr>
                  <td>Applied On</td>
                  <td>{fmtDate(data.appliedAt)}</td>
                </tr>
                <tr>
                  <td>Resume</td>
                  <td>
                    {data.resumeUrl ? (
                      <a href={data.resumeUrl} target="_blank" rel="noreferrer">
                        {data.resumeFileName || 'Download'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Selection & email */}
          <section className="pd-card">
            <h3 className="pd-card-title">Selection &amp; Email</h3>
            <table className="pd-info-table">
              <tbody>
                <tr>
                  <td>Status</td>
                  <td>
                    <span className={`pd-badge pd-badge-${data.selectionStatus}`}>
                      {data.selectionStatus}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Selected At</td>
                  <td>{fmtDateTime(data.selectedAt)}</td>
                </tr>
                {data.rejectedAt && (
                  <tr>
                    <td>Rejected At</td>
                    <td>{fmtDateTime(data.rejectedAt)}</td>
                  </tr>
                )}
                <tr>
                  <td>Selection Email</td>
                  <td>
                    {data.emailSent ? (
                      <span className="pd-yes">Sent {fmtDateTime(data.emailSentAt)}</span>
                    ) : (
                      <span className="pd-no">Not sent</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Interview */}
          <section className="pd-card">
            <h3 className="pd-card-title">Interview Details</h3>
            {data.interviewId ? (
              <table className="pd-info-table">
                <tbody>
                  <tr>
                    <td>Scheduled At</td>
                    <td>
                      <strong>{fmtDateTime(data.scheduledAt)}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>Type</td>
                    <td>{data.interviewType || '—'}</td>
                  </tr>
                  <tr>
                    <td>Difficulty</td>
                    <td>{data.difficultyLevel || '—'}</td>
                  </tr>
                  <tr>
                    <td>Duration</td>
                    <td>{data.durationMinutes ? `${data.durationMinutes} min` : '—'}</td>
                  </tr>
                  <tr>
                    <td>Coding Round</td>
                    <td>{data.codingRound ? 'Yes' : 'No'}</td>
                  </tr>
                  <tr>
                    <td>Join Link Email</td>
                    <td>
                      {data.joinLinkSent ? (
                        <span className="pd-yes">Sent {fmtDateTime(data.joinLinkSentAt)}</span>
                      ) : (
                        <span className="pd-no">Not sent yet (auto 5 min before)</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Room</td>
                    <td>
                      {data.roomId ? (
                        <span className="pd-mono">{data.roomId}</span>
                      ) : (
                        <span className="pd-no">Not created yet</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Status</td>
                    <td>
                      <span
                        className={`pd-badge pd-badge-${data.interviewStatus || 'pending'}`}
                      >
                        {data.interviewStatus
                          ? data.interviewStatus.charAt(0).toUpperCase() +
                            data.interviewStatus.slice(1)
                          : 'Pending'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="pd-empty">No interview scheduled yet.</p>
            )}
            {data.roomId && (
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  className="pd-back"
                  style={{ marginBottom: 0 }}
                  onClick={() => navigate(`/transcripts/${data.roomId}`)}
                >
                  View Transcript
                </button>
              </div>
            )}

            {/* Cheating detection (always show so user sees where it will appear) */}
            <div className="pd-cheating-section">
              <h3 className="pd-card-title" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
                🛡️ Cheating detection
              </h3>
              {!data.interviewId ? (
                <p className="pd-muted">
                  No interview yet. Detection events (gaze away, head turn, tab switch, etc.) will appear here after the candidate joins and completes an interview.
                </p>
              ) : detections.length === 0 ? (
                <p className="pd-muted">No detection events for this interview yet.</p>
              ) : (
                <>
                  <p className="pd-muted">
                    {detections.length} event{detections.length !== 1 ? 's' : ''} recorded.
                  </p>
                  <div className="pd-detections-pills">
                    {['eyes_away', 'head_turned', 'multiple_faces', 'low_attention', 'tab_switch', 'copy_paste', 'fullscreen_exit', 'mouse_leave'].map(
                      (type) => {
                        const count = detections.filter((d) => d.violation_type === type).length
                        if (count === 0) return null
                        return (
                          <span key={type} className="pd-detection-pill">
                            {type.replace(/_/g, ' ')}: {count}
                          </span>
                        )
                      }
                    )}
                  </div>
                  <table className="pd-detections-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Confidence</th>
                        {detections.some((d) => d.metadata?.attentionScore != null) && <th>Score</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detections.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td>{d.violation_type.replace(/_/g, ' ')}</td>
                          <td>
                            <span className={`pd-severity pd-severity-${d.severity}`}>{d.severity}</span>
                          </td>
                          <td>{Math.round(d.confidence * 100)}%</td>
                          {detections.some((x) => x.metadata?.attentionScore != null) && (
                            <td>{d.metadata?.attentionScore ?? '—'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {data.selectionStatus === 'selected' && (
              <div className="pd-interview-actions">
                <button
                  type="button"
                  className="pd-back"
                  style={{ marginBottom: 0, marginRight: '0.5rem' }}
                  onClick={handleInstantInterview}
                  disabled={instantLoading}
                >
                  {instantLoading ? 'Creating…' : '⚡ Instant Interview'}
                </button>
                <button
                  type="button"
                  className="pd-back"
                  style={{ marginBottom: 0 }}
                  onClick={handleResetAll}
                  disabled={resetLoading}
                >
                  {resetLoading ? 'Resetting…' : '🔄 Reset (score & selection)'}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="pd-col">
          {/* AI Score */}
          <section className="pd-card">
            <h3 className="pd-card-title">AI Evaluation</h3>
            {data.score !== null ? (
              <>
                <div className="pd-score-bar-wrap">
                  <div className="pd-score-bar">
                    <div
                      className={`pd-score-fill ${scoreColor}`}
                      style={{ width: `${data.score}%` }}
                    />
                  </div>
                  <span className={`pd-score-val ${scoreColor}`}>{data.score}/100</span>
                </div>
                {data.evaluatedAt && (
                  <p className="pd-muted">Evaluated on {fmtDate(data.evaluatedAt)}</p>
                )}
                {data.summary && <p className="pd-summary">{data.summary}</p>}
              </>
            ) : (
              <p className="pd-empty">Not evaluated yet.</p>
            )}
          </section>

          {/* Skills */}
          {data.score !== null && (
            <>
              {data.mustHave.length > 0 && (
                <section className="pd-card">
                  <h3 className="pd-card-title pd-card-title-green">Must-Have Matched Skills</h3>
                  <div className="pd-tags">
                    {data.mustHave.map((s, i) => (
                      <span key={i} className="pd-tag pd-tag-green">
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {data.niceToHave.length > 0 && (
                <section className="pd-card">
                  <h3 className="pd-card-title pd-card-title-blue">Nice-To-Have Matched Skills</h3>
                  <div className="pd-tags">
                    {data.niceToHave.map((s, i) => (
                      <span key={i} className="pd-tag pd-tag-blue">
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {data.missingSkills.length > 0 && (
                <section className="pd-card">
                  <h3 className="pd-card-title pd-card-title-red">Missing Skills</h3>
                  <div className="pd-tags">
                    {data.missingSkills.map((s, i) => (
                      <span key={i} className="pd-tag pd-tag-red">
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Job info */}
          <section className="pd-card">
            <h3 className="pd-card-title">Job Description</h3>
            <table className="pd-info-table">
              <tbody>
                <tr>
                  <td>Title</td>
                  <td>
                    <strong>{data.jobTitle}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            {data.requiredSkills.length > 0 && (
              <div className="pd-jd-skills">
                <strong>Required Skills:</strong>
                <div className="pd-tags">
                  {data.requiredSkills.map((s, i) => (
                    <span key={i} className="pd-tag pd-tag-outline">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.jobDescription && (
              <details className="pd-jd-desc">
                <summary>View full description</summary>
                <p>{data.jobDescription}</p>
              </details>
            )}
          </section>

          {/* Timeline */}
          <section className="pd-card">
            <h3 className="pd-card-title">Activity Timeline</h3>
            <ul className="pd-timeline">
              {data.appliedAt && (
                <li>
                  <span className="pd-tl-dot green" />
                  <span className="pd-tl-text">Applied</span>
                  <span className="pd-tl-date">{fmtDate(data.appliedAt)}</span>
                </li>
              )}
              {data.evaluatedAt && (
                <li>
                  <span className="pd-tl-dot blue" />
                  <span className="pd-tl-text">AI Score: {data.score}/100</span>
                  <span className="pd-tl-date">{fmtDate(data.evaluatedAt)}</span>
                </li>
              )}
              {data.selectedAt && (
                <li>
                  <span className="pd-tl-dot green" />
                  <span className="pd-tl-text">Selected</span>
                  <span className="pd-tl-date">{fmtDateTime(data.selectedAt)}</span>
                </li>
              )}
              {data.rejectedAt && (
                <li>
                  <span className="pd-tl-dot red" />
                  <span className="pd-tl-text">Rejected</span>
                  <span className="pd-tl-date">{fmtDateTime(data.rejectedAt)}</span>
                </li>
              )}
              {data.emailSentAt && (
                <li>
                  <span className="pd-tl-dot purple" />
                  <span className="pd-tl-text">Selection email sent</span>
                  <span className="pd-tl-date">{fmtDateTime(data.emailSentAt)}</span>
                </li>
              )}
              {data.interviewCreatedAt && (
                <li>
                  <span className="pd-tl-dot blue" />
                  <span className="pd-tl-text">Interview scheduled — {fmtDateTime(data.scheduledAt)}</span>
                  <span className="pd-tl-date">{fmtDate(data.interviewCreatedAt)}</span>
                </li>
              )}
              {data.joinLinkSentAt && (
                <li>
                  <span className="pd-tl-dot purple" />
                  <span className="pd-tl-text">Join link email sent</span>
                  <span className="pd-tl-date">{fmtDateTime(data.joinLinkSentAt)}</span>
                </li>
              )}
              {data.roomCreatedAt && (
                <li>
                  <span className="pd-tl-dot blue" />
                  <span className="pd-tl-text">Video room created</span>
                  <span className="pd-tl-date">{fmtDateTime(data.roomCreatedAt)}</span>
                </li>
              )}
              {data.interviewStatus === 'completed' && (
                <li>
                  <span className="pd-tl-dot green" />
                  <span className="pd-tl-text">Interview completed</span>
                  <span className="pd-tl-date" />
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
