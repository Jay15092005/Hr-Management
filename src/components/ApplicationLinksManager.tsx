import { useEffect, useMemo, useState } from 'react'
import { supabase, type JobApplicationLink, type JobDescription } from '../lib/supabase'
import './ApplicationLinksManager.css'

function makeSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function ApplicationLinksManager() {
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [links, setLinks] = useState<JobApplicationLink[]>([])
  const [jobId, setJobId] = useState('')
  const [title, setTitle] = useState('')
  const [customRequirements, setCustomRequirements] = useState('')
  const [additionalDetails, setAdditionalDetails] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseUrl = useMemo(() => window.location.origin, [])

  useEffect(() => {
    ;(async () => {
      const [jobsRes, linksRes] = await Promise.all([
        supabase
          .from('job_descriptions')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('job_application_links')
          .select('*, job_descriptions(*)')
          .order('created_at', { ascending: false }),
      ])
      if (!jobsRes.error) setJobs((jobsRes.data || []) as JobDescription[])
      if (!linksRes.error) setLinks((linksRes.data || []) as JobApplicationLink[])
    })()
  }, [])

  const selectedJob = jobs.find((j) => j.id === jobId) || null

  const fillFromSelectedJob = (job: JobDescription) => {
    const skills = (job.required_skills || []).filter(Boolean).join(', ')
    const composedDetails = [
      job.description?.trim() ? `Job overview: ${job.description.trim()}` : '',
      job.min_experience_years != null ? `Minimum experience: ${job.min_experience_years}+ years` : '',
      job.location ? `Location: ${job.location}` : '',
      job.degree_required ? `Degree: ${job.degree_required}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    setTitle(job.title || '')
    setCustomRequirements(skills)
    setAdditionalDetails(composedDetails)
  }

  useEffect(() => {
    if (!selectedJob) return
    fillFromSelectedJob(selectedJob)
  }, [selectedJob?.id])

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!jobId || !expiresAt) {
      setError('Select a job and expiry time.')
      return
    }
    setLoading(true)
    const payload = {
      job_description_id: jobId,
      title: title.trim() || null,
      custom_requirements: customRequirements.trim() || null,
      additional_details: additionalDetails.trim() || null,
      slug: makeSlug(),
      expires_at: new Date(expiresAt).toISOString(),
      is_active: true,
    }
    const { data, error: insErr } = await supabase
      .from('job_application_links')
      .insert(payload)
      .select('*, job_descriptions(*)')
      .single()
    setLoading(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    setLinks((prev) => [data as JobApplicationLink, ...prev])
    setTitle('')
    setCustomRequirements('')
    setAdditionalDetails('')
    setExpiresAt('')
  }

  const toggleActive = async (id: string, next: boolean) => {
    const { error: upErr } = await supabase
      .from('job_application_links')
      .update({ is_active: next })
      .eq('id', id)
    if (upErr) return
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, is_active: next } : l)))
  }

  return (
    <div className="alm-wrap">
      <div className="alm-card">
        <div className="alm-strip" />
        <h2>Application Form Links</h2>
        <p className="alm-subtitle">Create and share HR-specific public links for candidate submissions.</p>
        <form onSubmit={createLink} className="alm-form">
          <label>Job description</label>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} required>
          <option value="">Select job description</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
              {jobs.length === 0 && (
                <div className="alm-hint">No job descriptions found. Create one first in the Description tab.</div>
              )}
              {selectedJob && (
                <div className="alm-selected-job">
                  <div className="alm-selected-job-title">Selected: {selectedJob.title}</div>
                  <div className="alm-selected-job-desc">
                    {selectedJob.description.length > 140
                      ? `${selectedJob.description.slice(0, 140)}...`
                      : selectedJob.description}
                  </div>
                </div>
              )}
          <label>Form title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional title shown to candidates"
        />
          <label>Requirements</label>
        <textarea
          value={customRequirements}
          onChange={(e) => setCustomRequirements(e.target.value)}
          placeholder="Requirements for candidates (optional)"
          rows={3}
        />
          <label>Additional details</label>
        <textarea
          value={additionalDetails}
          onChange={(e) => setAdditionalDetails(e.target.value)}
          placeholder="Other details/instructions (optional)"
          rows={3}
        />
          <label>Expiry date & time</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          required
        />
          {error && <div className="alm-error">{error}</div>}
          <button className="alm-submit" type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create share link'}
        </button>
      </form>
      </div>

      <div className="alm-links">
        {links.map((l) => {
          const shareUrl = `${baseUrl}/apply/${l.slug}`
          const expired = new Date(l.expires_at).getTime() < Date.now()
          return (
            <div key={l.id} className="alm-link-card">
              <div className="alm-link-title">{l.title || l.job_descriptions?.title || 'Form link'}</div>
              {l.custom_requirements && (
                <div className="alm-link-line">
                  <strong>Requirements:</strong> {l.custom_requirements}
                </div>
              )}
              {l.additional_details && (
                <div className="alm-link-line">
                  <strong>Details:</strong> {l.additional_details}
                </div>
              )}
              <div className="alm-link-meta">Expires: {new Date(l.expires_at).toLocaleString()}</div>
              <div className={`alm-status ${expired ? 'is-expired' : l.is_active ? 'is-active' : 'is-disabled'}`}>
                {expired ? 'Expired' : l.is_active ? 'Active' : 'Disabled'}
              </div>
              <input className="alm-link-input" readOnly value={shareUrl} />
              <div className="alm-link-actions">
                <button className="alm-btn-secondary" type="button" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                  Copy link
                </button>
                <button className="alm-btn-secondary" type="button" onClick={() => toggleActive(l.id, !l.is_active)}>
                  {l.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
