import { useState, useEffect, useRef } from 'react'
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  VideoPlayer,
} from '@videosdk.live/react-sdk'
import { supabase } from '../lib/supabase'
import { validateVideoSDKRoom, getMeetingJoinUrl } from '../utils/videosdk'
import './InterviewRoom.css'

interface InterviewRoomProps {
  roomId: string
  candidateName: string
  onLeave: () => void
}

// VideoSDK token - in production, this should be generated server-side
// For now, we'll need to get it from environment or generate it
const getVideoSDKToken = (): string => {
  // In production, call an API endpoint to generate token
  // For now, using API key directly (not recommended for production)
  const apiKey = import.meta.env.VITE_VIDEOSDK_API_KEY
  if (!apiKey) {
    throw new Error('VideoSDK API key not configured')
  }
  return apiKey
}

function Controls() {
  const { leave, toggleMic, toggleWebcam, micEnabled, webcamEnabled } = useMeeting()

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

function MeetingView({ roomId, candidateName, onLeave }: InterviewRoomProps) {
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roomValid, setRoomValid] = useState<boolean | null>(null)

  // Validate room before allowing join
  useEffect(() => {
    const validateRoom = async () => {
      try {
        const token = getVideoSDKToken()
        const room = await validateVideoSDKRoom(token, roomId)
        if (room) {
          setRoomValid(true)
        } else {
          setRoomValid(false)
          setError('Interview room not found or not yet active. Please wait for the interview to start.')
        }
      } catch (err) {
        console.error('Error validating room:', err)
        setRoomValid(false)
        setError('Failed to validate interview room. Please try again later.')
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
    try {
      const videoSDKToken = getVideoSDKToken()
      setToken(videoSDKToken)
      setLoading(false)
    } catch (err) {
      console.error('Error getting VideoSDK token:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize VideoSDK')
      setLoading(false)
    }
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
      }}
      token={token}
    >
      <MeetingView roomId={roomId} candidateName={candidateName} onLeave={onLeave} />
    </MeetingProvider>
  )
}
