import { useState } from 'react'
import { supabase, type CandidateSelection } from '../lib/supabase'
import { sendSelectionEmail } from '../utils/email'
import './InterviewScheduler.css'

interface InterviewSchedulerProps {
  candidateSelection: CandidateSelection
  candidateName: string
  candidateEmail: string
  jobTitle: string
  onClose: () => void
  onSuccess: () => void
}

const INTERVIEW_TYPES = ['Python', 'Node.js', 'Java', 'React', 'Angular', 'Vue.js', 'Go', 'Rust', 'C++', 'Other']
const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'] as const
const DURATION_OPTIONS = [30, 45, 60, 90, 120]

export default function InterviewScheduler({
  candidateSelection,
  candidateName,
  candidateEmail,
  jobTitle,
  onClose,
  onSuccess,
}: InterviewSchedulerProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    interview_type: 'Python',
    difficulty_level: 'Medium' as 'Easy' | 'Medium' | 'Hard',
    duration_minutes: 60,
    coding_round: false,
    scheduled_date: '',
    scheduled_time: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Validate form
      if (!formData.scheduled_date || !formData.scheduled_time) {
        throw new Error('Please select interview date and time')
      }

      // Combine date and time into ISO string
      const scheduledAt = new Date(`${formData.scheduled_date}T${formData.scheduled_time}`).toISOString()

      // Validate that scheduled time is in the future
      if (new Date(scheduledAt) <= new Date()) {
        throw new Error('Interview must be scheduled for a future date and time')
      }

      // Create interview configuration
      const { error: configError } = await supabase.from('interview_configurations').insert({
        candidate_selection_id: candidateSelection.id,
        interview_type: formData.interview_type,
        difficulty_level: formData.difficulty_level,
        duration_minutes: formData.duration_minutes,
        coding_round: formData.coding_round,
        scheduled_at: scheduledAt,
        status: 'scheduled',
      })

      if (configError) throw configError

      // Update candidate_selections to mark interview as scheduled
      const { error: updateError } = await supabase
        .from('candidate_selections')
        .update({ interview_scheduled: true })
        .eq('id', candidateSelection.id)

      if (updateError) throw updateError

      // Send Email 1 (Selection Confirmation with interview details)
      const emailResult = await sendSelectionEmail({
        to: candidateEmail,
        candidateName,
        jobTitle,
        interviewDate: new Date(scheduledAt).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        interviewTime: new Date(scheduledAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        interviewDuration: formData.duration_minutes,
        interviewType: formData.interview_type,
        difficultyLevel: formData.difficulty_level,
        codingRound: formData.coding_round,
      })

      if (!emailResult.ok) {
        console.warn('Interview scheduled but email failed to send:', emailResult.error)
        setError(`Interview scheduled successfully, but email failed: ${emailResult.error || 'Check email configuration.'}`)
      }

      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error scheduling interview:', err)
      setError(err instanceof Error ? err.message : 'Failed to schedule interview')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Get minimum date/time (today)
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="interview-scheduler-overlay" onClick={onClose}>
      <div className="interview-scheduler-modal" onClick={(e) => e.stopPropagation()}>
        <div className="interview-scheduler-header">
          <h2>Schedule Interview</h2>
          <button className="close-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="interview-scheduler-form">
          <div className="form-group">
            <label htmlFor="candidate-name">Candidate</label>
            <input
              id="candidate-name"
              type="text"
              value={candidateName}
              disabled
              className="form-input disabled"
            />
          </div>

          <div className="form-group">
            <label htmlFor="interview-type">Interview Type *</label>
            <select
              id="interview-type"
              value={formData.interview_type}
              onChange={(e) => handleChange('interview_type', e.target.value)}
              className="form-select"
              required
            >
              {INTERVIEW_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="difficulty-level">Difficulty Level *</label>
              <select
                id="difficulty-level"
                value={formData.difficulty_level}
                onChange={(e) => handleChange('difficulty_level', e.target.value as 'Easy' | 'Medium' | 'Hard')}
                className="form-select"
                required
              >
                {DIFFICULTY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="duration">Duration (minutes) *</label>
              <select
                id="duration"
                value={formData.duration_minutes}
                onChange={(e) => handleChange('duration_minutes', parseInt(e.target.value))}
                className="form-select"
                required
              >
                {DURATION_OPTIONS.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.coding_round}
                onChange={(e) => handleChange('coding_round', e.target.checked)}
                className="form-checkbox"
              />
              <span>Coding Round</span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="scheduled-date">Interview Date *</label>
              <input
                id="scheduled-date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => handleChange('scheduled_date', e.target.value)}
                min={today}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="scheduled-time">Interview Time *</label>
              <input
                id="scheduled-time"
                type="time"
                value={formData.scheduled_time}
                onChange={(e) => handleChange('scheduled_time', e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-cancel" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Scheduling...' : 'Schedule Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
