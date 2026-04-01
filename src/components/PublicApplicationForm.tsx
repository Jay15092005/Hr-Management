import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './PublicApplicationForm.css'

type LinkMeta = {
  link_id: string
  slug: string
  title: string | null
  expires_at: string
  is_active: boolean
  is_expired: boolean
  custom_requirements: string | null
  additional_details: string | null
  job_title: string
  job_description: string
  required_skills: string[]
}

export default function PublicApplicationForm() {
  const MAX_FILE_SIZE_MB = 10
  const { slug } = useParams<{ slug: string }>()
  const [meta, setMeta] = useState<LinkMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    years_of_experience: '',
    location: '',
    degree: '',
  })

  const expired = useMemo(() => {
    if (!meta) return false
    return meta.is_expired || !meta.is_active
  }, [meta])

  useEffect(() => {
    ;(async () => {
      if (!slug) return
      setLoading(true)
      const { data, error: rpcErr } = await supabase.rpc('get_public_application_link', {
        p_slug: slug,
      })
      setLoading(false)
      if (rpcErr || !Array.isArray(data) || !data[0]) {
        setError('Invalid application link.')
        return
      }
      setMeta(data[0] as LinkMeta)
    })()
  }, [slug])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!meta || !slug || !file) return
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setFileError(`File too large. Max allowed is ${MAX_FILE_SIZE_MB} MB.`)
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const body = new FormData()
      body.append('slug', slug)
      body.append('name', form.name)
      body.append('email', form.email)
      body.append('years_of_experience', form.years_of_experience)
      body.append('location', form.location)
      body.append('degree', form.degree)
      body.append('resume', file)

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-public-application`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body,
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Submission failed')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="paf-wrap"><div className="paf-card">Loading application form...</div></div>
  if (!meta) return <div className="paf-wrap"><div className="paf-card">{error || 'Link not found.'}</div></div>
  if (expired) return <div className="paf-wrap"><div className="paf-card">This application link has expired.</div></div>
  if (submitted) {
    return (
      <div className="paf-wrap">
        <div className="paf-card paf-thanks">
          <div className="paf-confetti" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className={`c c-${(i % 4) + 1}`} />
            ))}
          </div>
          <div className="paf-celebrate">🎉</div>
          <h2>Application submitted</h2>
          <p>Thank you! Your resume has been received successfully.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="paf-wrap">
      <div className="paf-card">
        <div className="paf-header-strip" />
        <h1>{meta.title || meta.job_title}</h1>
        <p className="paf-job-desc">{meta.job_description}</p>
      {meta.required_skills?.length > 0 && (
          <p>
          <strong>Required skills:</strong> {meta.required_skills.join(', ')}
        </p>
      )}
      {meta.custom_requirements && (
        <p>
          <strong>Requirements:</strong> {meta.custom_requirements}
        </p>
      )}
      {meta.additional_details && (
        <p>
          <strong>Additional details:</strong> {meta.additional_details}
        </p>
      )}
        <p className="paf-expiry">This form expires on {new Date(meta.expires_at).toLocaleString()}</p>

        <form onSubmit={submit} className="paf-form">
          <label>Full name</label>
          <input
          required
          placeholder="Enter your full name"
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
        />
          <label>Email</label>
          <input
          required
          type="email"
          placeholder="Enter your email"
          value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
        />
          <label>Years of experience</label>
          <input
          type="number"
          min={0}
          placeholder="e.g. 2"
          value={form.years_of_experience}
          onChange={(e) => setForm((s) => ({ ...s, years_of_experience: e.target.value }))}
        />
          <label>Location</label>
          <input
          placeholder="e.g. Ahmedabad / Remote"
          value={form.location}
          onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
        />
          <label>Degree</label>
          <input
          placeholder="e.g. B.Tech"
          value={form.degree}
          onChange={(e) => setForm((s) => ({ ...s, degree: e.target.value }))}
        />
          <label>Resume (PDF, DOC, DOCX, TXT)</label>
          <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          required
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null
            if (!selected) {
              setFile(null)
              setFileError(null)
              return
            }
            if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
              setFile(null)
              setFileError(`File too large. Max allowed is ${MAX_FILE_SIZE_MB} MB.`)
              return
            }
            setFile(selected)
            setFileError(null)
          }}
        />
          <small className="paf-note">Maximum file size: {MAX_FILE_SIZE_MB} MB</small>
          {fileError && <div className="paf-error">{fileError}</div>}
          {error && <div className="paf-error">{error}</div>}
          <button className="paf-submit" type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit application'}
        </button>
      </form>
      </div>
    </div>
  )
}
