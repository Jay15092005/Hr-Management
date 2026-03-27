import { Navigate } from 'react-router-dom'
import { SignIn, useAuth as useClerkAuth } from '@clerk/react'
import { useAuth } from '../../contexts/AuthContext'
import './ClerkAuth.css'

export default function LoginPage() {
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth()
  const { loading, syncError, clearSyncError } = useAuth()

  // Clerk signed in and HR profile sync finished (third-party Supabase tokens — no Supabase Auth session).
  const readyForApp = clerkLoaded && isSignedIn && !loading

  if (readyForApp) {
    return <Navigate to="/" replace />
  }

  const showSpinner = !clerkLoaded || (isSignedIn && loading)

  return (
    <div className="clerk-auth-root">
      {showSpinner && (
        <p className="clerk-auth-status" style={{ margin: '0 0 1rem', color: '#64748b' }}>
          Connecting…
        </p>
      )}
      {syncError && (
        <div
          role="alert"
          style={{
            maxWidth: 420,
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: 8,
            fontSize: '0.875rem',
            lineHeight: 1.45,
          }}
        >
          <strong>Setup required.</strong> {syncError}
          <button
            type="button"
            onClick={() => clearSyncError()}
            style={{ display: 'block', marginTop: '0.5rem', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', padding: 0, font: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      )}
      <SignIn path="/login" routing="path" signUpUrl="/signup" />
    </div>
  )
}
