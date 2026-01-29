import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import InterviewRoom from './InterviewRoom'
import { supabase } from '../lib/supabase'
import './JoinInterview.css'

export default function JoinInterview() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [candidateName, setCandidateName] = useState<string>('Guest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) {
      setError('Invalid interview room ID')
      setLoading(false)
      return
    }

    // Try to fetch candidate name from interview configuration
    const fetchInterviewInfo = async () => {
      try {
        // Check if interview exists - don't filter by status for instant interviews
        const { data: interviewConfig, error: configError } = await supabase
          .from('interview_configurations')
          .select(`
            *,
            candidate_selections!inner (
              resumes!inner (
                name,
                email
              )
            )
          `)
          .eq('room_id', roomId)
          .single()

        if (!configError && interviewConfig) {
          const resume = interviewConfig.candidate_selections?.resumes
          if (resume?.name) {
            setCandidateName(resume.name)
          }
          // If interview exists in database, it's valid (even if status is not 'active' yet)
          // The InterviewRoom component will handle VideoSDK validation
        } else {
          // If interview not found in database, set error
          setError('Interview room not found')
        }
      } catch (err) {
        console.error('Error fetching interview info:', err)
        setError('Failed to load interview information')
      } finally {
        setLoading(false)
      }
    }

    fetchInterviewInfo()
  }, [roomId])

  const handleLeave = () => {
    navigate('/')
  }

  if (loading) {
    return (
      <div className="join-interview-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading interview room...</p>
        </div>
      </div>
    )
  }

  if (error || !roomId) {
    return (
      <div className="join-interview-container">
        <div className="error-state">
          <h2>Error</h2>
          <p>{error || 'Invalid interview room ID'}</p>
          <button onClick={handleLeave} className="btn-back">
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="join-interview-container">
      <InterviewRoom roomId={roomId} candidateName={candidateName} onLeave={handleLeave} />
    </div>
  )
}
