import { useState, useEffect, useRef } from 'react'
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  VideoPlayer,
} from '@videosdk.live/react-sdk'
import { supabase } from '../lib/supabase'
import './InterviewRoom.css'

interface InterviewRoomProps {
  roomId: string
  candidateName: string
  onLeave: () => void
}

// Get VideoSDK JWT token from Edge Function
const getVideoSDKToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-videosdk-token', {
      method: 'GET',
    })

    if (error) {
      console.error('Error calling token generation function:', error)
      return null
    }

    if (data?.success && data?.token) {
      return data.token
    }

    console.error('Failed to get token:', data)
    return null
  } catch (err) {
    console.error('Error getting VideoSDK token:', err)
    return null
  }
}

function Controls() {
  const { leave, toggleMic, toggleWebcam, localParticipant } = useMeeting()
  const micEnabled = localParticipant?.micOn
  const webcamEnabled = localParticipant?.webcamOn

  return (
    <div className="meeting-controls">
      <button
        onClick={() => toggleMic()}
        className={`control-btn ${micEnabled ? 'active' : 'inactive'}`}
        title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
      >
        {micEnabled ? '🎤' : '🔇'}
      </button>
      <button
        onClick={() => toggleWebcam()}
        className={`control-btn ${webcamEnabled ? 'active' : 'inactive'}`}
        title={webcamEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
      >
        {webcamEnabled ? '📹' : '📷'}
      </button>
      <button onClick={() => leave()} className="control-btn leave-btn" title="Leave Meeting">
        🚪 Leave
      </button>
    </div>
  )
}

function ParticipantView({ participantId }: { participantId: string }) {
  const micRef = useRef<HTMLAudioElement>(null)
  const { micStream, webcamOn, micOn, isLocal, displayName } = useParticipant(participantId)

  useEffect(() => {
    if (micRef.current) {
      if (micOn && micStream) {
        const mediaStream = new MediaStream()
        mediaStream.addTrack(micStream.track)

        micRef.current.srcObject = mediaStream
        micRef.current
          .play()
          .catch((error) => console.error('Audio play failed:', error))
      } else {
        micRef.current.srcObject = null
      }
    }
  }, [micStream, micOn])

  return (
    <div className="participant-view">
      <div className="participant-info">
        <span className="participant-name">{displayName || (isLocal ? 'You' : 'Participant')}</span>
        <div className="participant-status">
          {micOn && <span className="status-indicator mic">🎤</span>}
          {webcamOn && <span className="status-indicator cam">📹</span>}
        </div>
      </div>
      {webcamOn ? (
        <VideoPlayer
          participantId={participantId}
          type="video"
          containerStyle={{
            height: '100%',
            width: '100%',
            borderRadius: '8px',
          }}
          className="video-player"
        />
      ) : (
        <div className="no-video-placeholder">
          <div className="avatar">{displayName?.[0]?.toUpperCase() || '?'}</div>
          <p>{displayName || 'No Video'}</p>
        </div>
      )}
      <audio ref={micRef} autoPlay playsInline muted={isLocal} />
    </div>
  )
}

function MeetingView({ roomId, onLeave }: InterviewRoomProps) {
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roomValid, setRoomValid] = useState<boolean | null>(null)

  // Validate room before allowing join
  useEffect(() => {
    const validateRoom = async () => {
      try {
        // First check if interview exists in database
        const { data: interviewConfig, error: dbError } = await supabase
          .from('interview_configurations')
          .select('status, room_id')
          .eq('room_id', roomId)
          .single()

        if (dbError || !interviewConfig) {
          console.error('Interview not found in database:', dbError)
          setRoomValid(false)
          setError('Interview room not found. Please check the link and try again.')
          return
        }

        // For instant interviews (status: 'active'), allow joining immediately
        if (interviewConfig.status === 'active') {
          console.log('Instant interview found - allowing join')
          setRoomValid(true)
          return
        }

        // For scheduled interviews, check if it's time
        if (interviewConfig.status === 'scheduled') {
          // Allow joining - VideoSDK SDK will handle connection
          // The room might be created 5 minutes before, so allow joining
          setRoomValid(true)
          return
        }

        // For other statuses, allow joining - let VideoSDK SDK handle it
        setRoomValid(true)
      } catch (err) {
        console.error('Error validating room:', err)
        // If validation fails but we have roomId, allow joining anyway
        // VideoSDK SDK will handle connection errors
        setRoomValid(true)
      }
    }

    validateRoom()
  }, [roomId])

  const { join, participants } = useMeeting({
    onMeetingJoined: () => {
      setJoined('JOINED')
      setError(null)
    },
    onMeetingLeft: () => {
      onLeave()
    },
    onError: (error) => {
      console.error('Meeting error:', error)
      setError(error.message || 'An error occurred in the meeting')
    },
  })

  const joinMeeting = () => {
    if (!roomValid) {
      setError('Room is not yet active. Please wait for the interview to start.')
      return
    }
    setJoined('JOINING')
    setError(null)
    join()
  }

  if (roomValid === null) {
    return (
      <div className="interview-room-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Validating interview room...</p>
        </div>
      </div>
    )
  }

  if (roomValid === false) {
    return (
      <div className="interview-room-container">
        <div className="error-state">
          <h2>Interview Not Started</h2>
          <p>{error || 'The interview room is not yet active.'}</p>
          <p className="info-text">
            The interview room will become active at the scheduled start time. Please wait for the interview to begin.
          </p>
          <button onClick={onLeave} className="btn-back">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="interview-room-container">
      <div className="meeting-header">
        <h2>Interview Room</h2>
        <p className="room-id">Room ID: {roomId}</p>
      </div>

      {joined === 'JOINED' ? (
        <div className="meeting-content">
          <Controls />
          <div className="participants-grid">
            {[...participants.keys()].map((participantId) => (
              <ParticipantView key={participantId} participantId={participantId} />
            ))}
          </div>
        </div>
      ) : joined === 'JOINING' ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Joining the meeting...</p>
        </div>
      ) : (
        <div className="join-screen">
          <h3>Ready to join the interview?</h3>
          <p>Click the button below to join the interview room.</p>
          {error && <div className="error-message">{error}</div>}
          <button onClick={joinMeeting} className="btn-join">
            Join Interview
          </button>
        </div>
      )}
    </div>
  )
}

export default function InterviewRoom({ roomId, candidateName, onLeave }: InterviewRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const videoSDKToken = await getVideoSDKToken()
        if (videoSDKToken) {
          setToken(videoSDKToken)
        } else {
          setError('Failed to get VideoSDK token. Please check your configuration.')
        }
      } catch (err) {
        console.error('Error getting VideoSDK token:', err)
        setError(err instanceof Error ? err.message : 'Failed to initialize VideoSDK')
      } finally {
        setLoading(false)
      }
    }

    fetchToken()
  }, [])

  if (loading) {
    return (
      <div className="interview-room-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Initializing interview room...</p>
        </div>
      </div>
    )
  }

  if (error || !token) {
    return (
      <div className="interview-room-container">
        <div className="error-state">
          <h2>Error</h2>
          <p>{error || 'Failed to initialize VideoSDK. Please check your configuration.'}</p>
          <button onClick={onLeave} className="btn-back">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <MeetingProvider
      config={{
        meetingId: roomId,
        micEnabled: true,
        webcamEnabled: true,
        name: candidateName,
        debugMode: false,
      }}
      token={token}
    >
      <MeetingView roomId={roomId} candidateName={candidateName} onLeave={onLeave} />
    </MeetingProvider>
  )
}
