import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './AuthPages.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError('Enter your work email.')
      return
    }
    setSubmitting(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: false },
      })
      if (otpError) throw otpError
      navigate('/auth/verify-otp', { state: { email: trimmed, mode: 'login' as const } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>HR sign in</h1>
        <p className="sub">We’ll email you a one-time code (passwordless).</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={submitting}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending code…' : 'Send code'}
          </button>
        </form>
        <div className="auth-links">
          <Link to="/signup">New HR? Create an account</Link>
          <span className="hint">
            Trouble receiving the code? Check spam or wait a minute and try again from this page.
          </span>
        </div>
      </div>
    </div>
  )
}
