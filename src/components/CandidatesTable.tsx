import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  getResumeReadableUrl,
  resumeHasDownloadableFile,
  supabase,
  type Resume,
  type JobDescription,
  type ResumeScore,
  type CandidateSelection,
  type InterviewConfiguration,
} from '../lib/supabase'
import { getGeminiService } from '../lib/gemini'
import { extractResumeTextFromUrl } from '../utils/resumeParser'
import InterviewScheduler from './InterviewScheduler'
import ResumeFileLink from './ResumeFileLink'
import './CandidatesTable.css'

interface RowData {
  resume: Resume
  score?: ResumeScore
  selection?: CandidateSelection
  interview?: InterviewConfiguration
}

interface CandidatesTableProps {
  resumes: Resume[]
  jobDescription: JobDescription | null
}

export default function CandidatesTable({ resumes, jobDescription }: CandidatesTableProps) {
  const [rows, setRows] = useState<RowData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState<string | null>(null)
  const [evaluatingAll, setEvaluatingAll] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null)
  const [detailsHoverId, setDetailsHoverId] = useState<string | null>(null)
  const [detailsAnchorRect, setDetailsAnchorRect] = useState<DOMRect | null>(null)
  const detailsLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [schedulingRow, setSchedulingRow] = useState<RowData | null>(null)
  const [instantRow, setInstantRow] = useState<RowData | null>(null)
  const [instantLoading, setInstantLoading] = useState(false)
  const [instantError, setInstantError] = useState<string | null>(null)
  const [instantFormData, setInstantFormData] = useState({
    interview_type: 'Python',
    difficulty_level: 'Medium' as 'Easy' | 'Medium' | 'Hard',
    duration_minutes: 60,
    coding_round: false,
  })

  const fetchData = async () => {
    if (!jobDescription) return
    setLoading(true)
    setError(null)
    try {
      const resumeIds = resumes.map((r) => r.id)
      if (resumeIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const { data: scoresData, error: scoresErr } = await supabase
        .from('resume_scores')
        .select('*')
        .eq('job_description_id', jobDescription.id)
        .in('resume_id', resumeIds)

      if (scoresErr) throw scoresErr

      const { data: selectionsData, error: selErr } = await supabase
        .from('candidate_selections')
        .select('*')
        .eq('job_description_id', jobDescription.id)
        .in('resume_id', resumeIds)

      if (selErr) throw selErr

      const selectionIds = (selectionsData || []).map((s) => s.id)
      let interviewsData: InterviewConfiguration[] = []
      if (selectionIds.length > 0) {
        const { data, error: intErr } = await supabase
          .from('interview_configurations')
          .select('*')
          .in('candidate_selection_id', selectionIds)
        if (!intErr) interviewsData = data || []
      }

      const scoresByResume = new Map<string, ResumeScore>()
      ;(scoresData || []).forEach((s: ResumeScore) => scoresByResume.set(s.resume_id, s))
      const selectionsByResume = new Map<string, CandidateSelection>()
      ;(selectionsData || []).forEach((s: CandidateSelection) => selectionsByResume.set(s.resume_id, s))
      const interviewsBySel = new Map<string, InterviewConfiguration>()
      interviewsData.forEach((i) => interviewsBySel.set(i.candidate_selection_id, i))

      const newRows: RowData[] = resumes.map((resume) => {
        const selection = selectionsByResume.get(resume.id)
        return {
          resume,
          score: scoresByResume.get(resume.id),
          selection: selection ?? undefined,
          interview: selection ? interviewsBySel.get(selection.id) : undefined,
        }
      })
      setRows(newRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const resumeIdsKey = resumes.map((r) => r.id).join(',')
  useEffect(() => {
    if (jobDescription) fetchData()
  }, [jobDescription?.id, resumeIdsKey])

  const evaluateResume = async (resume: Resume, retryCount = 0) => {
    if (!jobDescription || !resumeHasDownloadableFile(resume)) return
    setEvaluating(resume.id)
    setError(null)
    try {
      const { data: existing } = await supabase
        .from('resume_scores')
        .select('*')
        .eq('resume_id', resume.id)
        .eq('job_description_id', jobDescription.id)
        .maybeSingle()
      if (existing) {
        setRows((prev) =>
          prev.map((r) =>
            r.resume.id === resume.id ? { ...r, score: existing } : r
          )
        )
        setEvaluating(null)
        return
      }

      // Extract text from resume (PDF, DOCX, TXT)
      let resumeText = ''
      try {
        const fileUrl = await getResumeReadableUrl(resume)
        if (!fileUrl) throw new Error('No file URL')
        resumeText = await extractResumeTextFromUrl(fileUrl)
      } catch {
        // Fallback to basic candidate info if extraction fails
        resumeText = `Candidate Name: ${resume.name}\nEmail: ${resume.email}\nExperience: ${resume.years_of_experience || 0} years\nLocation: ${resume.location || 'Not specified'}\nDegree: ${resume.degree || 'Not specified'}`
      }

      const gemini = getGeminiService()
      const evaluation = await gemini.evaluateResume(
        resumeText,
        jobDescription.description
      )

      const { data: scoreData, error: dbError } = await supabase
        .from('resume_scores')
        .insert([
          {
            resume_id: resume.id,
            job_description_id: jobDescription.id,
            score: evaluation.score,
            missing_skills: evaluation.missing_skills,
            must_have_matched_skills: evaluation.must_have_matched_skills,
            nice_to_have_matched_skills: evaluation.nice_to_have_matched_skills,
            summary: evaluation.summary,
            resume_text: resumeText,
          },
        ])
        .select()
        .single()
      if (dbError) throw dbError

      setRows((prev) =>
        prev.map((r) =>
          r.resume.id === resume.id ? { ...r, score: scoreData } : r
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Evaluation failed'
      setError(msg)
      const waitMatch = msg.match(/wait ([\d]+) seconds/)
      if (
        (msg.includes('quota') || msg.includes('Quota')) &&
        retryCount < 1 &&
        waitMatch
      ) {
        const wait = parseInt(waitMatch[1], 10) * 1000 + 1000
        await new Promise((r) => setTimeout(r, wait))
        return evaluateResume(resume, retryCount + 1)
      }
    } finally {
      setEvaluating(null)
    }
  }

  const evaluateAll = async () => {
    if (!jobDescription) return
    setEvaluatingAll(true)
    setError(null)
    try {
      for (let i = 0; i < resumes.length; i++) {
        const r = resumes[i]
        if (resumeHasDownloadableFile(r)) await evaluateResume(r)
        if (i < resumes.length - 1)
          await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    } finally {
      setEvaluatingAll(false)
    }
  }

  const resetAll = async () => {
    if (
      !jobDescription ||
      !confirm('Reset all evaluation scores and selections for this job?')
    )
      return
    setProcessing('all')
    setError(null)
    try {
      const { error: selErr } = await supabase
        .from('candidate_selections')
        .delete()
        .eq('job_description_id', jobDescription.id)
      if (selErr) throw selErr
      const { error: scoreErr } = await supabase
        .from('resume_scores')
        .delete()
        .eq('job_description_id', jobDescription.id)
      if (scoreErr) throw scoreErr
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setProcessing(null)
    }
  }

  const resetPerson = async (row: RowData) => {
    if (!jobDescription || !confirm(`Reset score and selection for ${row.resume.name}?`)) return
    setProcessing(row.resume.id)
    setError(null)
    try {
      await supabase
        .from('resume_scores')
        .delete()
        .eq('resume_id', row.resume.id)
        .eq('job_description_id', jobDescription.id)
      await supabase
        .from('candidate_selections')
        .delete()
        .eq('resume_id', row.resume.id)
        .eq('job_description_id', jobDescription.id)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setProcessing(null)
      setMenuOpenId(null)
    }
  }

  const handleSelect = async (row: RowData) => {
    if (!jobDescription) return
    setProcessing(row.resume.id)
    setError(null)
    try {
      await supabase.from('candidate_selections').upsert(
        {
          resume_id: row.resume.id,
          job_description_id: jobDescription.id,
          status: 'selected',
          selected_at: new Date().toISOString(),
        },
        { onConflict: 'resume_id,job_description_id' }
      )
      // Navigate to detail page after selecting
      navigate(`/candidate/${jobDescription.id}/${row.resume.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(null)
      setMenuOpenId(null)
    }
  }

  const handleReject = async (row: RowData) => {
    if (!jobDescription) return
    setProcessing(row.resume.id)
    setError(null)
    try {
      await supabase.from('candidate_selections').upsert(
        {
          resume_id: row.resume.id,
          job_description_id: jobDescription.id,
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          email_sent: false,
          email_sent_at: null,
        },
        { onConflict: 'resume_id,job_description_id' }
      )
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setProcessing(null)
      setMenuOpenId(null)
    }
  }

  const handleScheduleInterview = (row: RowData) => {
    if (!row.selection) return
    setSchedulingRow(row)
    setMenuOpenId(null)
  }

  const handleInstantInterview = (row: RowData) => {
    if (!row.selection) return
    setInstantRow(row)
    setInstantError(null)
    setInstantFormData({
      interview_type: 'Python',
      difficulty_level: 'Medium',
      duration_minutes: 60,
      coding_round: false,
    })
    setMenuOpenId(null)
  }

  const handleInstantSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!instantRow?.selection || !jobDescription) return
    setInstantLoading(true)
    setInstantError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-instant-interview',
        {
          body: {
            candidate_selection_id: instantRow.selection.id,
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
        await fetchData()
        const joinUrl = data.join_url
        if (joinUrl && confirm('Interview created. Open room now?'))
          window.open(joinUrl, '_blank')
        setInstantRow(null)
      } else throw new Error('Failed to create instant interview')
    } catch (err) {
      setInstantError(
        err instanceof Error ? err.message : 'Failed to create instant interview'
      )
    } finally {
      setInstantLoading(false)
    }
  }

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
        setMenuAnchorRect(null)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const openMenu = (row: RowData, e: React.MouseEvent) => {
    e.stopPropagation()
    if (menuOpenId === row.resume.id) {
      setMenuOpenId(null)
      setMenuAnchorRect(null)
      return
    }
    const btn = e.currentTarget as HTMLElement
    setMenuAnchorRect(btn.getBoundingClientRect())
    setMenuOpenId(row.resume.id)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4caf50'
    if (score >= 60) return '#ff9800'
    return '#f44336'
  }

  if (!jobDescription) {
    return (
      <div className="candidates-table-wrap">
        <p className="candidates-table-info">Select a job and click APPLY to see candidates.</p>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div className="candidates-table-wrap">
        <p className="candidates-table-loading">Loading…</p>
      </div>
    )
  }

  return (
    <div className="candidates-table-wrap" ref={menuRef}>
      <div className="candidates-table-toolbar">
        <h2 className="candidates-table-title">Candidates</h2>
        <div className="candidates-table-actions">
          <button
            type="button"
            className="btn-evaluate-all"
            onClick={evaluateAll}
            disabled={evaluatingAll || evaluating !== null || resumes.length === 0}
          >
            {evaluatingAll || evaluating ? 'Evaluating…' : 'Evaluate All'}
          </button>
          <button
            type="button"
            className="btn-reset-all"
            onClick={resetAll}
            disabled={processing === 'all'}
          >
            {processing === 'all' ? 'Resetting…' : 'Reset All'}
          </button>
        </div>
      </div>
      {error && <div className="candidates-table-error">{error}</div>}
      <div className="candidates-table-scroll">
        <table className="candidates-table">
          <thead>
            <tr>
              <th>Person Name</th>
              <th>View Resume</th>
              <th>Evaluation Score</th>
              <th>Details</th>
              <th className="th-menu"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const score = row.score
              const isEval = evaluating === row.resume.id
              const isProc = processing === row.resume.id
              const menuOpen = menuOpenId === row.resume.id
              return (
                <tr key={row.resume.id}>
                  <td className="td-name">{row.resume.name}</td>
                  <td>
                    <ResumeFileLink resume={row.resume} className="link-resume">
                      View Resume
                    </ResumeFileLink>
                  </td>
                  <td>
                    {score ? (
                      <span
                        className="score-badge"
                        style={{ backgroundColor: getScoreColor(score.score) }}
                      >
                        {score.score}/100
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-evaluate-one"
                        onClick={() => evaluateResume(row.resume)}
                        disabled={!resumeHasDownloadableFile(row.resume) || isEval || evaluatingAll}
                      >
                        {isEval ? 'Evaluating…' : 'Evaluate'}
                      </button>
                    )}
                  </td>
                  <td className="td-details">
                    {score ? (
                      <div
                        className="details-view-wrap"
                        onMouseEnter={(e) => {
                          if (detailsLeaveTimer.current) {
                            clearTimeout(detailsLeaveTimer.current)
                            detailsLeaveTimer.current = null
                          }
                          setDetailsAnchorRect((e.currentTarget as HTMLElement).getBoundingClientRect())
                          setDetailsHoverId(row.resume.id)
                        }}
                        onMouseLeave={() => {
                          detailsLeaveTimer.current = setTimeout(() => {
                            setDetailsHoverId(null)
                            setDetailsAnchorRect(null)
                            detailsLeaveTimer.current = null
                          }, 150)
                        }}
                      >
                        <button type="button" className="btn-details-view">
                          View
                        </button>
                      </div>
                    ) : (
                      <span className="details-placeholder">—</span>
                    )}
                  </td>
                  <td className="td-menu">
                    <button
                      type="button"
                      className="btn-dots"
                      onClick={(e) => {
                        e.stopPropagation()
                        openMenu(row, e)
                      }}
                      aria-label="Actions"
                    >
                      ⋮
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="candidates-table-empty">No candidates. Apply filters and select a job.</p>
      )}

      {detailsHoverId &&
        detailsAnchorRect &&
        (() => {
          const row = rows.find((r) => r.resume.id === detailsHoverId)
          if (!row?.score) return null
          const score = row.score
          const pad = 8
          const maxW = Math.min(340, window.innerWidth - pad * 2)
          const spaceBelow = window.innerHeight - detailsAnchorRect.bottom - pad - 16
          const spaceAbove = detailsAnchorRect.top - pad - 16
          const maxH = Math.min(400, Math.max(spaceBelow, spaceAbove, 200))
          const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow
          const left = Math.max(
            pad,
            Math.min(
              detailsAnchorRect.left,
              window.innerWidth - maxW - pad
            )
          )
          const top = showAbove
            ? detailsAnchorRect.top - maxH - 4
            : detailsAnchorRect.bottom + 4
          return createPortal(
            <div
              className="details-popover details-popover-portal"
              style={{
                position: 'fixed',
                left,
                top,
                maxWidth: maxW,
                maxHeight: maxH,
              }}
              onMouseEnter={() => {
                if (detailsLeaveTimer.current) {
                  clearTimeout(detailsLeaveTimer.current)
                  detailsLeaveTimer.current = null
                }
              }}
              onMouseLeave={() => {
                detailsLeaveTimer.current = setTimeout(() => {
                  setDetailsHoverId(null)
                  setDetailsAnchorRect(null)
                  detailsLeaveTimer.current = null
                }, 100)
              }}
            >
              {score.summary && (
                <p className="details-summary">
                  <strong>Summary:</strong> {score.summary}
                </p>
              )}
              {(score.must_have_matched_skills?.length ?? 0) > 0 && (
                <div className="details-matched must-have">
                  <strong>Must-have matched:</strong>
                  <ul>
                    {(score.must_have_matched_skills ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(score.nice_to_have_matched_skills?.length ?? 0) > 0 && (
                <div className="details-matched nice-to-have">
                  <strong>Nice-to-have matched:</strong>
                  <ul>
                    {(score.nice_to_have_matched_skills ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {score.missing_skills?.length > 0 && (
                <div className="details-missing">
                  <strong>Missing skills:</strong>
                  <ul>
                    {score.missing_skills.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!score.summary &&
                !(score.must_have_matched_skills?.length ?? 0) &&
                !(score.nice_to_have_matched_skills?.length ?? 0) &&
                !score.missing_skills?.length && (
                  <p className="details-empty">No extra details.</p>
                )}
            </div>,
            document.body
          )
        })()}

      {menuOpenId &&
        menuAnchorRect &&
        jobDescription &&
        (() => {
          const row = rows.find((r) => r.resume.id === menuOpenId)
          if (!row) return null
          const isProc = processing === row.resume.id
          return createPortal(
            <div
              className="dropdown-menu dropdown-menu-portal"
              style={{
                position: 'fixed',
                top: menuAnchorRect.bottom + 4,
                left: Math.min(
                  menuAnchorRect.right - 220,
                  window.innerWidth - 236
                ),
              }}
            >
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  navigate(`/candidate/${jobDescription.id}/${row.resume.id}`)
                  setMenuOpenId(null)
                  setMenuAnchorRect(null)
                }}
              >
                More Detail
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => resetPerson(row)}
                disabled={isProc}
              >
                🔄 Reset person (score & selection)
              </button>
            </div>,
            document.body
          )
        })()}

      {schedulingRow?.selection && (
        <InterviewScheduler
          candidateSelection={schedulingRow.selection}
          candidateName={schedulingRow.resume.name}
          candidateEmail={schedulingRow.resume.email}
          jobTitle={jobDescription.title}
          onClose={() => setSchedulingRow(null)}
          onSuccess={() => {
            fetchData()
            setSchedulingRow(null)
          }}
        />
      )}

      {instantRow && instantRow.selection && (
        <div
          className="instant-interview-overlay"
          onClick={() => setInstantRow(null)}
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
                onClick={() => setInstantRow(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleInstantSubmit} className="instant-interview-form">
              <div className="form-group">
                <label>Candidate</label>
                <input
                  type="text"
                  value={instantRow.resume.name}
                  disabled
                  className="form-input disabled"
                />
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
                <div className="candidates-table-error">{instantError}</div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setInstantRow(null)}
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
