import { useState, useEffect, useRef } from 'react'
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  VideoPlayer,
} from '@videosdk.live/react-sdk'
import { Constants, useTranscription } from '@videosdk.live/react-sdk'
import { supabase } from '../lib/supabase'
import { validateVideoSDKRoom, getMeetingJoinUrl } from '../utils/videosdk'
import './InterviewRoom.css'

interface InterviewRoomProps {
  roomId: string
  candidateName: string
  onLeave: () => void
}

// Feature flag: enable/disable realtime transcription integration.
// Default is false; set VITE_ENABLE_REALTIME_TRANSCRIPTION=true in .env to turn it on.
const ENABLE_REALTIME_TRANSCRIPTION =
  import.meta.env.VITE_ENABLE_REALTIME_TRANSCRIPTION === 'true'

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

  // Realtime transcription → save lines to Supabase
  const { startTranscription, stopTranscription } = useTranscription({
    onTranscriptionStateChanged: (data) => {
      console.log('[Transcription] state changed:', data)
      const { status, id } = data
      if (status === Constants.transcriptionEvents.TRANSCRIPTION_STARTING) {
        console.log('[Transcription] starting', id)
      } else if (status === Constants.transcriptionEvents.TRANSCRIPTION_STARTED) {
        console.log('[Transcription] started', id)
      } else if (status === Constants.transcriptionEvents.TRANSCRIPTION_STOPPING) {
        console.log('[Transcription] stopping', id)
      } else if (status === Constants.transcriptionEvents.TRANSCRIPTION_STOPPED) {
        console.log('[Transcription] stopped', id)
      }
    },
    onTranscriptionText: async (data) => {
      try {
        const { participantId, participantName, text, timestamp, type } = data
        console.log('[Transcription] text event:', {
          roomId,
          participantId,
          participantName,
          text,
          timestamp,
          type,
        })
        if (!text || !text.trim()) {
          console.log('[Transcription] text empty/whitespace, skipping')
          return
        }

        // Send one line to Supabase Edge Function
        const { data: fnData, error } = await supabase.functions.invoke('save-meeting-transcript', {
          body: {
            roomId: roomId,
            participantId,
            participantName,
            text,
            timestamp,
            type,
          },
        })
        if (error) {
          console.error('[Transcription] Failed to save transcript line (Supabase error):', error)
        } else {
          console.log('[Transcription] Line saved OK:', fnData)
        }
      } catch (e) {
        console.error('[Transcription] Exception while saving transcript line:', e)
      }
    },
  })

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

  const { join, participants, startRecording, stopRecording } = useMeeting({
    onMeetingJoined: () => {
      setJoined('JOINED')
      setError(null)
      // Start realtime transcription for this meeting
      if (ENABLE_REALTIME_TRANSCRIPTION) {
        try {
          console.log('[Transcription] calling startTranscription for room', roomId)
          startTranscription({})
        } catch (e) {
          console.error('[Transcription] Failed to start transcription:', e)
        }
      } else {
        console.log(
          '[Transcription] realtime transcription disabled (VITE_ENABLE_REALTIME_TRANSCRIPTION is not true)'
        )
      }

      // Start recording with post-transcription config
      try {
        const webhookUrl = import.meta.env.VITE_VIDEOSDK_WEBHOOK_URL || null
        const transcriptionConfig: any = {
          enabled: true,
          summary: {
            enabled: true,
            prompt:
              import.meta.env.VITE_TRANSCRIPTION_SUMMARY_PROMPT ||
              'Write summary in sections like Title, Agenda, Speakers, Action Items, Outlines, Notes and Summary',
          },
        }
        console.log('[Recording] startRecording called', {
          webhookUrl,
          hasPrompt: !!transcriptionConfig.summary.prompt,
        })
        // If you don't have a webhookUrl or awsDirPath, you should pass null (per VideoSDK docs)
        startRecording(webhookUrl, null, null, transcriptionConfig)
      } catch (e) {
        console.error('[Recording] Failed to start recording with transcription:', e)
      }
    },
    onMeetingLeft: () => {
      if (ENABLE_REALTIME_TRANSCRIPTION) {
        try {
          stopTranscription()
        } catch (e) {
          console.error('[Transcription] Failed to stop transcription:', e)
        }
      }

      // Stop recording when meeting ends
      try {
        console.log('[Recording] stopRecording called')
        stopRecording()
      } catch (e) {
        console.error('[Recording] Failed to stop recording:', e)
      }

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
      }}
      token={token}
    >
      <MeetingView roomId={roomId} candidateName={candidateName} onLeave={onLeave} />
    </MeetingProvider>
  )
}
