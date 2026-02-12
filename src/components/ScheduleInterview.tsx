import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './ScheduleInterview.css'

const MIN_LEAD_MINUTES = Number(import.meta.env.VITE_MIN_LEAD_TIME_MINUTES ?? '10')

export default function ScheduleInterview() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'form' | 'submitting' | 'success' | 'error'>('form')
  const [message, setMessage] = useState<string>('')
  const [scheduledAtLabel, setScheduledAtLabel] = useState<string | null>(null)

  const selectionId = searchParams.get('selectionId')
  const token = searchParams.get('token')

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectionId || !token) {
      setStatus('error')
      setMessage('Invalid link. Missing selection or token.')
      return
    }
    const dateVal = date || new Date().toISOString().slice(0, 10)
    const timeVal = time || '10:00'
    const [year, month, day] = dateVal.split('-').map(Number)
    const [hour, minute] = timeVal.split(':').map(Number)
    const scheduled = new Date(year, month - 1, day, hour, minute, 0, 0)
    const minAllowed = new Date(Date.now() + MIN_LEAD_MINUTES * 60 * 1000)
    if (scheduled.getTime() < minAllowed.getTime()) {
      setSubmitError(`Please choose a time at least ${MIN_LEAD_MINUTES} minutes from now.`)
      return
    }
    const slot = scheduled.toISOString()
    setSubmitError(null)
    setStatus('submitting')
    try {
      const { data, error } = await supabase.functions.invoke('schedule-interview', {
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

  if (!selectionId || !token) {
    return (
      <div className="schedule-interview-page">
        <div className="schedule-interview-card">
          <h1 className="schedule-interview-title error">Invalid link</h1>
          <p>This link is missing required parameters. Please use the link from your email.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="schedule-interview-page">
      <div className="schedule-interview-card">
        {status === 'form' || status === 'submitting' ? (
          <>
            <h1 className="schedule-interview-title">Schedule your interview</h1>
            <p className="schedule-interview-intro">
              Choose a date and time that works for you. The earliest you can pick is 10 minutes from now.
            </p>
            <form onSubmit={handleSubmit} className="schedule-interview-form">
              <div className="form-row">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={minDate}
                    required
                  />
                </label>
                <label>
                  <span>Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </label>
              </div>
              {submitError && <p className="schedule-interview-field-error">{submitError}</p>}
              <button type="submit" className="schedule-interview-submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Scheduling…' : 'Confirm slot'}
              </button>
            </form>
          </>
        ) : status === 'success' ? (
          <>
            <h1 className="schedule-interview-title success">✓ You’re all set</h1>
            <p className="schedule-interview-message">{message}</p>
            {scheduledAtLabel && <p className="schedule-interview-time">{scheduledAtLabel}</p>}
            <p className="schedule-interview-note">
              A join link will be sent to your email 5 minutes before the interview.
            </p>
          </>
        ) : (
          <>
            <h1 className="schedule-interview-title error">Something went wrong</h1>
            <p className="schedule-interview-message">{message}</p>
            <p className="schedule-interview-note">Please try again or contact HR.</p>
          </>
        )}
      </div>
    </div>
  )
}
