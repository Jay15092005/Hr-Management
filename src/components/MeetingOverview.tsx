import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './MeetingOverview.css'

interface PipelineRow {
  // Candidate
  resumeId: string
  name: string
  email: string
  location: string | null
  degree: string | null
  yearsExp: number | null
  // Job
  jobId: string
  jobTitle: string
  // Score
  score: number | null
  summary: string | null
  mustHave: string[]
  niceToHave: string[]
  missingSkills: string[]
  // Selection
  selectionId: string | null
  selectionStatus: string
  selectedAt: string | null
  emailSent: boolean
  emailSentAt: string | null
  // Interview
  interviewId: string | null
  interviewScheduledAt: string | null
  interviewType: string | null
  interviewStatus: string | null
  joinLinkSent: boolean
  joinLinkSentAt: string | null
  roomId: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type SortKey = 'name' | 'jobTitle' | 'score' | 'selectionStatus' | 'interviewScheduledAt'
type SortDir = 'asc' | 'desc'
type Filter = 'all' | 'selected' | 'scheduled' | 'link-sent' | 'completed'

export default function MeetingOverview() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PipelineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      // Fetch selections with related data
      const { data: selections, error: selErr } = await supabase
        .from('candidate_selections')
        .select(`
          id, status, selected_at, email_sent, email_sent_at, interview_scheduled,
          resumes!inner ( id, name, email, location, degree, years_of_experience ),
          job_descriptions!inner ( id, title )
        `)
        .order('created_at', { ascending: false })

      if (selErr) throw selErr

      // Fetch all scores
      const { data: scores } = await supabase
        .from('resume_scores')
        .select('resume_id, job_description_id, score, summary, missing_skills, must_have_matched_skills, nice_to_have_matched_skills')

      // Fetch all interview configs
      const { data: interviews } = await supabase
        .from('interview_configurations')
        .select('id, candidate_selection_id, scheduled_at, interview_type, status, join_link_email_sent, join_link_sent_at, room_id')

      const scoreMap = new Map<string, typeof scores extends (infer T)[] | null ? T : never>()
      for (const s of scores ?? []) {
        scoreMap.set(`${s.resume_id}_${s.job_description_id}`, s)
      }

      const interviewMap = new Map<string, typeof interviews extends (infer T)[] | null ? T : never>()
      for (const i of interviews ?? []) {
        interviewMap.set(i.candidate_selection_id, i)
      }

      const mapped: PipelineRow[] = (selections ?? []).map((sel: any) => {
        const resume = sel.resumes
        const job = sel.job_descriptions
        const sc = scoreMap.get(`${resume.id}_${job.id}`)
        const iv = interviewMap.get(sel.id)

        return {
          resumeId: resume.id,
          name: resume.name,
          email: resume.email,
          location: resume.location,
          degree: resume.degree,
          yearsExp: resume.years_of_experience,
          jobId: job.id,
          jobTitle: job.title,
          score: sc?.score ?? null,
          summary: sc?.summary ?? null,
          mustHave: (sc?.must_have_matched_skills as string[]) ?? [],
          niceToHave: (sc?.nice_to_have_matched_skills as string[]) ?? [],
          missingSkills: (sc?.missing_skills as string[]) ?? [],
          selectionId: sel.id,
          selectionStatus: sel.status,
          selectedAt: sel.selected_at,
          emailSent: sel.email_sent,
          emailSentAt: sel.email_sent_at,
          interviewId: iv?.id ?? null,
          interviewScheduledAt: iv?.scheduled_at ?? null,
          interviewType: iv?.interview_type ?? null,
          interviewStatus: iv?.status ?? null,
          joinLinkSent: iv?.join_link_email_sent ?? false,
          joinLinkSentAt: iv?.join_link_sent_at ?? null,
          roomId: iv?.room_id ?? null,
        }
      })

      setRows(mapped)
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Filtering
  const filtered = useMemo(() => {
    let result = rows
    if (filter === 'selected') result = result.filter((r) => r.selectionStatus === 'selected')
    else if (filter === 'scheduled') result = result.filter((r) => !!r.interviewScheduledAt)
    else if (filter === 'link-sent') result = result.filter((r) => r.joinLinkSent)
    else if (filter === 'completed') result = result.filter((r) => r.interviewStatus === 'completed')
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q)
      )
    }
    return result
  }, [rows, filter, search])

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'jobTitle':
          cmp = a.jobTitle.localeCompare(b.jobTitle)
          break
        case 'score':
          cmp = (a.score ?? -1) - (b.score ?? -1)
          break
        case 'selectionStatus':
          cmp = a.selectionStatus.localeCompare(b.selectionStatus)
          break
        case 'interviewScheduledAt':
          cmp =
            new Date(a.interviewScheduledAt ?? 0).getTime() -
            new Date(b.interviewScheduledAt ?? 0).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  function statusBadge(status: string) {
    const cls =
      status === 'selected'
        ? 'badge-selected'
        : status === 'rejected'
        ? 'badge-rejected'
        : 'badge-pending'
    return <span className={`mo-badge ${cls}`}>{status}</span>
  }

  function interviewBadge(row: PipelineRow) {
    if (!row.interviewId) return <span className="mo-badge badge-none">Not scheduled</span>
    if (row.interviewStatus === 'completed')
      return <span className="mo-badge badge-completed">Completed</span>
    if (row.interviewStatus === 'active')
      return <span className="mo-badge badge-active">In Progress</span>
    if (row.joinLinkSent)
      return <span className="mo-badge badge-link-sent">Link Sent</span>
    return <span className="mo-badge badge-scheduled">Scheduled</span>
  }

  function yesNo(val: boolean) {
    return val ? (
      <span className="mo-yes">Yes</span>
    ) : (
      <span className="mo-no">No</span>
    )
  }

  // Stats
  const stats = useMemo(() => {
    const total = rows.length
    const selected = rows.filter((r) => r.selectionStatus === 'selected').length
    const scheduled = rows.filter((r) => !!r.interviewScheduledAt).length
    const linkSent = rows.filter((r) => r.joinLinkSent).length
    const completed = rows.filter((r) => r.interviewStatus === 'completed').length
    return { total, selected, scheduled, linkSent, completed }
  }, [rows])

  if (loading) {
    return (
      <div className="mo-container">
        <p className="mo-loading">Loading pipeline data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mo-container">
        <p className="mo-error">{error}</p>
        <button className="mo-btn" onClick={loadData}>Retry</button>
      </div>
    )
  }

  return (
    <div className="mo-container">
      <h2 className="mo-title">Meeting &amp; Pipeline Overview</h2>

      {/* Stats row */}
      <div className="mo-stats-row">
        <div className="mo-stat" onClick={() => setFilter('all')}>
          <span className="mo-stat-num">{stats.total}</span>
          <span className="mo-stat-label">Total</span>
        </div>
        <div className="mo-stat" onClick={() => setFilter('selected')}>
          <span className="mo-stat-num">{stats.selected}</span>
          <span className="mo-stat-label">Selected</span>
        </div>
        <div className="mo-stat" onClick={() => setFilter('scheduled')}>
          <span className="mo-stat-num">{stats.scheduled}</span>
          <span className="mo-stat-label">Scheduled</span>
        </div>
        <div className="mo-stat" onClick={() => setFilter('link-sent')}>
          <span className="mo-stat-num">{stats.linkSent}</span>
          <span className="mo-stat-label">Link Sent</span>
        </div>
        <div className="mo-stat" onClick={() => setFilter('completed')}>
          <span className="mo-stat-num">{stats.completed}</span>
          <span className="mo-stat-label">Completed</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mo-toolbar">
        <input
          type="text"
          className="mo-search"
          placeholder="Search name, email, or job..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mo-filters">
          {(['all', 'selected', 'scheduled', 'link-sent', 'completed'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`mo-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'link-sent' ? 'Link Sent' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button className="mo-btn mo-refresh-btn" onClick={loadData}>Refresh</button>
      </div>

      {sorted.length === 0 ? (
        <p className="mo-empty">No candidates match the current filter.</p>
      ) : (
        <div className="mo-table-wrap">
          <table className="mo-table">
            <thead>
              <tr>
                <th className="mo-th mo-th-num">#</th>
                <th className="mo-th mo-th-sortable" onClick={() => handleSort('name')}>
                  Candidate{sortArrow('name')}
                </th>
                <th className="mo-th mo-th-sortable" onClick={() => handleSort('jobTitle')}>
                  Job{sortArrow('jobTitle')}
                </th>
                <th className="mo-th mo-th-sortable" onClick={() => handleSort('score')}>
                  Score{sortArrow('score')}
                </th>
                <th className="mo-th mo-th-sortable" onClick={() => handleSort('selectionStatus')}>
                  Selection{sortArrow('selectionStatus')}
                </th>
                <th className="mo-th">Email Sent</th>
                <th className="mo-th mo-th-sortable" onClick={() => handleSort('interviewScheduledAt')}>
                  Interview{sortArrow('interviewScheduledAt')}
                </th>
                <th className="mo-th">Link Sent</th>
                <th className="mo-th">Status</th>
                <th className="mo-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const rowKey = `${row.resumeId}_${row.jobId}`
                return (
                    <tr key={rowKey} className="mo-tr">
                      <td className="mo-td mo-td-num">{idx + 1}</td>
                      <td className="mo-td mo-td-candidate">
                        <div className="mo-candidate-name">{row.name}</div>
                        <div className="mo-candidate-email">{row.email}</div>
                      </td>
                      <td className="mo-td">{row.jobTitle}</td>
                      <td className="mo-td mo-td-score">
                        {row.score !== null ? (
                          <span
                            className={`mo-score ${
                              row.score >= 70 ? 'high' : row.score >= 40 ? 'mid' : 'low'
                            }`}
                          >
                            {row.score}
                          </span>
                        ) : (
                          <span className="mo-no">—</span>
                        )}
                      </td>
                      <td className="mo-td">{statusBadge(row.selectionStatus)}</td>
                      <td className="mo-td mo-td-center">
                        {yesNo(row.emailSent)}
                        {row.emailSentAt && (
                          <div className="mo-sub-date">{fmtDate(row.emailSentAt)}</div>
                        )}
                      </td>
                      <td className="mo-td">
                        {row.interviewScheduledAt ? (
                          <div>
                            <div>{fmtDateTime(row.interviewScheduledAt)}</div>
                            {row.interviewType && (
                              <div className="mo-sub-date">{row.interviewType}</div>
                            )}
                          </div>
                        ) : (
                          <span className="mo-no">—</span>
                        )}
                      </td>
                      <td className="mo-td mo-td-center">
                        {yesNo(row.joinLinkSent)}
                        {row.joinLinkSentAt && (
                          <div className="mo-sub-date">{fmtDate(row.joinLinkSentAt)}</div>
                        )}
                      </td>
                      <td className="mo-td">{interviewBadge(row)}</td>
                      <td className="mo-td mo-td-actions">
                        <button
                          className="mo-btn mo-btn-sm mo-btn-primary"
                          onClick={() => navigate(`/pipeline/${row.selectionId}`)}
                          title="Full pipeline details"
                        >
                          Details
                        </button>
                        {row.roomId && (
                          <button
                            className="mo-btn mo-btn-sm"
                            onClick={() => navigate(`/transcripts/${row.roomId}`)}
                            title="View transcript"
                          >
                            Transcript
                          </button>
                        )}
                      </td>
                    </tr>
                  )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mo-footer">
        Showing {sorted.length} of {rows.length} candidates
      </div>
    </div>
  )
}
