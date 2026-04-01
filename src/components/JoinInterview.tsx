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

    // Candidate join uses RPC (RLS blocks direct table reads for anon)
    const fetchInterviewInfo = async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('interview_join_context', {
          p_room_id: roomId,
        })

        if (rpcError || data == null) {
          setError('Interview room not found')
          return
        }

        const ctx = data as { candidate_name?: string | null }
        if (ctx.candidate_name) {
          setCandidateName(ctx.candidate_name)
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
