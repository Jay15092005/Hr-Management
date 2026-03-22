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

  /** Must match Supabase: Authentication → Providers → Email → Email OTP Length (6). */
  const OTP_LENGTH = 6

  const setOtpDigitsOnly = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setToken(digits)
  }

  const resend = async () => {
    setError(null)
    setSubmitting(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
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
    const code = token.replace(/\D/g, '')
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email.`)
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
          We sent a <strong>{OTP_LENGTH}-digit</strong> code to <strong>{email}</strong>. Enter it below to finish.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}
          <label htmlFor="token">{OTP_LENGTH}-digit code</label>
          <input
            id="token"
            name="token"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            value={token}
            onChange={(e) => setOtpDigitsOnly(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              const text = e.clipboardData?.getData('text') ?? ''
              setOtpDigitsOnly(text)
            }}
            placeholder={'•'.repeat(OTP_LENGTH)}
            aria-describedby="otp-hint"
            disabled={submitting}
            className="auth-otp-input"
          />
          <p id="otp-hint" className="auth-otp-hint">
            Numbers only — exactly {OTP_LENGTH} digits.
          </p>
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
