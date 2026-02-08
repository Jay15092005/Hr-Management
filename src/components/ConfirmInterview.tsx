import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './ConfirmInterview.css'

export default function ConfirmInterview() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('')
  const [scheduledAtLabel, setScheduledAtLabel] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    const selectionId = searchParams.get('selectionId')
    const slot = searchParams.get('slot')

    if (!token || !selectionId || !slot) {
      setStatus('error')
      setMessage('Invalid link. Missing token, selection, or time.')
      return
    }

    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('confirm-interview-slot', {
          body: { token, selectionId, slot },
        })
        if (error) {
          setStatus('error')
          setMessage(error.message || 'Something went wrong.')
          return
        }
        if (data?.success) {
          setStatus('success')
          setScheduledAtLabel(data.scheduledAtLabel || null)
          setMessage(data.alreadyScheduled ? data.message : (data.message || 'Your interview has been scheduled.'))
        } else {
          setStatus('error')
          setMessage(data?.error || 'Could not schedule interview.')
        }
      } catch (e) {
        setStatus('error')
        setMessage(e instanceof Error ? e.message : 'Something went wrong.')
      }
    }

    run()
  }, [searchParams])

  return (
    <div className="confirm-interview-page">
      <div className="confirm-interview-card">
        {status === 'loading' && (
          <p className="confirm-interview-loading">Confirming your interview time…</p>
        )}
        {status === 'success' && (
          <>
            <h1 className="confirm-interview-title">✓ You’re all set</h1>
            <p className="confirm-interview-message">{message}</p>
            {scheduledAtLabel && (
              <p className="confirm-interview-time">{scheduledAtLabel}</p>
            )}
            <p className="confirm-interview-note">
              A join link will be sent to your email 5 minutes before the interview.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="confirm-interview-title error">Couldn’t confirm</h1>
            <p className="confirm-interview-message">{message}</p>
            <p className="confirm-interview-note">
              The link may have expired or already been used. Please contact HR for a new link.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
