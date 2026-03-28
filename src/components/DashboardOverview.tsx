import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type Stats = {
  resumes: number
  resumeScores: number
  interviews: number
  selected: number
  loading: boolean
}

type Props = {
  headerActions?: ReactNode
}

export default function DashboardOverview({ headerActions }: Props) {
  const [stats, setStats] = useState<Stats>({
    resumes: 0,
    resumeScores: 0,
    interviews: 0,
    selected: 0,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [r1, r2, r3, r4] = await Promise.all([
          supabase.from('resumes').select('id', { count: 'exact', head: true }),
          supabase.from('resume_scores').select('id', { count: 'exact', head: true }),
          supabase.from('interview_configurations').select('id', { count: 'exact', head: true }),
          supabase
            .from('candidate_selections')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'selected'),
        ])
        if (cancelled) return
        setStats({
          resumes: r1.count ?? 0,
          resumeScores: r2.count ?? 0,
          interviews: r3.count ?? 0,
          selected: r4.count ?? 0,
          loading: false,
        })
      } catch {
        if (!cancelled) setStats((s) => ({ ...s, loading: false }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const applied = stats.resumes
  const shortlisted = stats.resumeScores
  const interviewed = stats.interviews
  const selected = stats.selected
  const maxFunnel = Math.max(applied, 1)

  const pct = (n: number) => `${Math.max(8, Math.round((n / maxFunnel) * 100))}%`

  const completion =
    stats.loading || interviewed === 0
      ? 0
      : Math.min(100, Math.round((selected / Math.max(interviewed, 1)) * 100))

  return (
    <div className="dash-overview">
      <section className="dash-overview-hero">
        <div>
          <h2 className="dash-overview-title">Dashboard overview</h2>
          <p className="dash-overview-sub">
            Welcome back. Here&apos;s a snapshot of your recruitment pipeline.
          </p>
        </div>
        {headerActions ? <div className="dash-overview-actions">{headerActions}</div> : null}
      </section>

      <section className="dash-kpi-grid" aria-label="Key metrics">
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-top">
            <span className="material-symbols-outlined dash-kpi-icon">groups</span>
          </div>
          <p className="dash-kpi-label">Total candidates</p>
          <h3 className="dash-kpi-value">{stats.loading ? '—' : applied.toLocaleString()}</h3>
          <p className="dash-kpi-hint">Resumes in system</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-top">
            <span className="material-symbols-outlined dash-kpi-icon">event_available</span>
          </div>
          <p className="dash-kpi-label">Interview configs</p>
          <h3 className="dash-kpi-value">{stats.loading ? '—' : interviewed.toLocaleString()}</h3>
          <p className="dash-kpi-hint">Scheduled or tracked</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-top">
            <span className="material-symbols-outlined dash-kpi-icon dash-kpi-icon--accent">verified</span>
          </div>
          <p className="dash-kpi-label">Selected</p>
          <h3 className="dash-kpi-value">{stats.loading ? '—' : selected.toLocaleString()}</h3>
          <p className="dash-kpi-hint">Marked selected</p>
        </div>
        <div className="dash-kpi-card">
          <div className="dash-kpi-card-top">
            <span className="material-symbols-outlined dash-kpi-icon">task_alt</span>
          </div>
          <p className="dash-kpi-label">Pipeline signal</p>
          <h3 className="dash-kpi-value">{stats.loading ? '—' : `${completion}%`}</h3>
          <div className="dash-kpi-bar">
            <div className="dash-kpi-bar-fill" style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <section className="dash-insights-grid">
        <div className="dash-panel dash-panel--wide">
          <div className="dash-panel-head">
            <h4 className="dash-panel-title">Recruitment funnel</h4>
            <span className="dash-panel-badge">Live data</span>
          </div>
          <div className="dash-funnel">
            <div className="dash-funnel-step">
              <div className="dash-funnel-row">
                <span>Applied</span>
                <span className="dash-funnel-num">{stats.loading ? '—' : applied}</span>
              </div>
              <div className="dash-funnel-track">
                <div className="dash-funnel-fill" style={{ width: pct(applied) }} />
              </div>
            </div>
            <div className="dash-funnel-step">
              <div className="dash-funnel-row">
                <span>Scored / reviewed</span>
                <span className="dash-funnel-num">{stats.loading ? '—' : shortlisted}</span>
              </div>
              <div className="dash-funnel-track dash-funnel-track--mid">
                <div className="dash-funnel-fill dash-funnel-fill--2" style={{ width: pct(shortlisted) }} />
              </div>
            </div>
            <div className="dash-funnel-step">
              <div className="dash-funnel-row">
                <span>Interviews</span>
                <span className="dash-funnel-num">{stats.loading ? '—' : interviewed}</span>
              </div>
              <div className="dash-funnel-track dash-funnel-track--narrow">
                <div className="dash-funnel-fill dash-funnel-fill--3" style={{ width: pct(interviewed) }} />
              </div>
            </div>
            <div className="dash-funnel-step">
              <div className="dash-funnel-row">
                <span>Selected</span>
                <span className="dash-funnel-num">{stats.loading ? '—' : selected}</span>
              </div>
              <div className="dash-funnel-track dash-funnel-track--narrowest">
                <div className="dash-funnel-fill dash-funnel-fill--4" style={{ width: pct(selected) }} />
              </div>
            </div>
          </div>
          <div className="dash-weekly">
            <div>
              <h5 className="dash-weekly-label">Activity sketch</h5>
              <div className="dash-bars" aria-hidden>
                {[40, 60, 85, 55, 45, 30, 20].map((h, i) => (
                  <div
                    key={i}
                    className={`dash-bar ${i === 2 ? 'dash-bar--peak' : ''}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="dash-weekly-copy">
              <p className="dash-weekly-title">Mid-week focus</p>
              <p className="dash-weekly-highlight">Wednesday</p>
              <p className="dash-weekly-sub">Plan interviews earlier in the week when possible.</p>
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <h4 className="dash-panel-title">AI insights</h4>
            <span className="material-symbols-outlined dash-panel-more">more_horiz</span>
          </div>
          <ul className="dash-feed">
            <li className="dash-feed-item">
              <div className="dash-feed-avatar dash-feed-avatar--ai">
                <span className="material-symbols-outlined">auto_awesome</span>
              </div>
              <div>
                <p className="dash-feed-title">Resume scoring active</p>
                <p className="dash-feed-meta">
                  AI scores are available in Workflow after you pick a job description.
                </p>
                <p className="dash-feed-time">Tip</p>
              </div>
            </li>
            <li className="dash-feed-item">
              <div className="dash-feed-avatar dash-feed-avatar--doc">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <div>
                <p className="dash-feed-title">AI interview agent</p>
                <p className="dash-feed-meta">
                  Run the local agent with your stack so voice interviews join VideoSDK rooms automatically.
                </p>
                <p className="dash-feed-time">Automation</p>
              </div>
            </li>
            <li className="dash-feed-item">
              <div className="dash-feed-avatar dash-feed-avatar--doc">
                <span className="material-symbols-outlined">description</span>
              </div>
              <div>
                <p className="dash-feed-title">Transcripts & recordings</p>
                <p className="dash-feed-meta">
                  Import transcripts and load cloud recordings from Meeting Details → room links.
                </p>
                <p className="dash-feed-time">VideoSDK</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="dash-ai-banner glass-card" aria-label="Quick summary">
        <div className="dash-ai-banner-inner">
          <div className="dash-ai-icon-wrap">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <div>
            <h4 className="dash-ai-banner-title">Next steps</h4>
            <p className="dash-ai-banner-text">
              Use <strong>Workflow</strong> to filter candidates and score against a role, then{' '}
              <strong>Meeting Details</strong> to track interviews and open transcripts.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
