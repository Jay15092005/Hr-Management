import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import './AuthPages.css'

type LocationState = { email?: string; mode?: 'login' | 'signup' }

export default function VerifyOtpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const email = state.email?.trim().toLowerCase() ?? ''

  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!email) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Missing email</h1>
          <p className="sub">Start from sign in or sign up to receive a code.</p>
          <div className="auth-links">
            <Link to="/login">Go to sign in</Link>
            <Link to="/signup">Go to sign up</Link>
          </div>
        </div>
      </div>
    )
  }

  const resend = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const shouldCreate = state.mode === 'signup'
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: shouldCreate },
      })
      if (otpError) throw otpError
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const code = token.replace(/\s/g, '')
    if (code.length < 6) {
      setError('Enter the code from your email.')
      return
    }
    setSubmitting(true)
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })
      if (verifyError) throw verifyError
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Enter verification code</h1>
        <p className="sub">
          We sent a code to <strong>{email}</strong>. Paste it below to finish signing{' '}
          {state.mode === 'signup' ? 'up' : 'in'}.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          <label htmlFor="token">One-time code</label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456"
            disabled={submitting}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
        <p className="hint">
          <button
            type="button"
            onClick={resend}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#2563eb',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            Resend code
          </button>
        </p>
        <div className="auth-links">
          <Link to={state.mode === 'signup' ? '/signup' : '/login'}>Use a different email</Link>
        </div>
      </div>
    </div>
  )
}
