import { useEffect, useRef, useState } from 'react'
import { FaceMesh } from '@mediapipe/face_mesh'
import { Camera } from '@mediapipe/camera_utils'
import { supabase } from '../lib/supabase'
import './CheatingDetector.css'

interface CheatingDetectorProps {
    videoElement: HTMLVideoElement | null
    roomId: string
    enabled?: boolean
}

type ViolationType =
    | 'eyes_away'
    | 'multiple_faces'
    | 'head_turned'
    | 'low_attention'
    | 'tab_switch'
    | 'fullscreen_exit'
    | 'mouse_leave'
    | 'copy_paste'
    | 'suspicious_audio'
    | 'multiple_voices'

interface DetectionEvent {
    type: ViolationType
    severity: 'low' | 'medium' | 'high'
    confidence: number
    timestamp: number
}

interface GazeData {
    direction: 'center' | 'left' | 'right' | 'up' | 'down'
    confidence: number
}

interface HeadPose {
    pitch: number // up/down rotation
    yaw: number   // left/right rotation
    roll: number  // tilt
}

export default function CheatingDetector({ videoElement, roomId, enabled = true }: CheatingDetectorProps) {
    const [attentionScore, setAttentionScore] = useState(100)
    const [currentViolations, setCurrentViolations] = useState<string[]>([])
    const [isDetecting, setIsDetecting] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const faceMeshRef = useRef<FaceMesh | null>(null)
    const cameraRef = useRef<Camera | null>(null)
    const detectionHistoryRef = useRef<DetectionEvent[]>([])
    const lastAlertTimeRef = useRef<{ [key: string]: number }>({})

    // Tracking start times for continuous violations
    const gazeAwayStartRef = useRef<number | null>(null)
    const headTurnStartRef = useRef<number | null>(null)

    // Audio Context Refs
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioAnalyserRef = useRef<AnalyserNode | null>(null)
    const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

    // Configuration from environment or defaults
    const config = {
        enabled: import.meta.env.VITE_ENABLE_CHEATING_DETECTION === 'true' && enabled,
        sensitivity: import.meta.env.VITE_DETECTION_SENSITIVITY || 'medium',
        gazeAwayThreshold: parseInt(import.meta.env.VITE_GAZE_AWAY_THRESHOLD || '3000'),
        headTurnAngleThreshold: parseInt(import.meta.env.VITE_HEAD_TURN_ANGLE_THRESHOLD || '30'),
        attentionScoreThreshold: parseInt(import.meta.env.VITE_ATTENTION_SCORE_THRESHOLD || '50'),
    }

    // Debug logging
    console.log('[CheatingDetector] Config:', {
        envEnabled: import.meta.env.VITE_ENABLE_CHEATING_DETECTION,
        propEnabled: enabled,
        finalEnabled: config.enabled,
        hasVideo: !!videoElement,
    })

    // Calculate gaze direction from iris landmarks
    const calculateGazeDirection = (landmarks: any[]): GazeData => {
        if (!landmarks || landmarks.length < 478) {
            return { direction: 'center', confidence: 0 }
        }

        // Left eye iris center (landmark 468)
        const leftIris = landmarks[468]
        // Left eye corners (landmarks 33, 133)
        const leftEyeLeft = landmarks[33]
        const leftEyeRight = landmarks[133]

        // Calculate iris position relative to eye width
        const eyeWidth = Math.abs(leftEyeRight.x - leftEyeLeft.x)
        const irisOffset = (leftIris.x - leftEyeLeft.x) / eyeWidth

        // Determine direction based on iris position
        let direction: GazeData['direction'] = 'center'
        let confidence = 0.8

        // TUNING: Thresholds for gaze detection
        // Smaller threshold (< 0.30) means looking RIGHT (towards nose for left eye)
        // Larger threshold (> 0.70) means looking LEFT (away from nose for left eye)

        if (irisOffset < 0.30) {
            direction = 'right'
            confidence = 0.9
        } else if (irisOffset > 0.70) {
            direction = 'left'
            confidence = 0.9
        }

        // Check vertical gaze (simplified)
        const leftEyeTop = landmarks[159]
        const leftEyeBottom = landmarks[145]
        const eyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y)
        const irisVerticalOffset = (leftIris.y - leftEyeTop.y) / eyeHeight

        if (irisVerticalOffset < 0.30) {
            direction = 'up'
            confidence = 0.85
        } else if (irisVerticalOffset > 0.70) {
            direction = 'down'
            confidence = 0.85
        }

        return { direction, confidence }
    }

    // Calculate head pose from face landmarks
    const calculateHeadPose = (landmarks: any[]): HeadPose => {
        if (!landmarks || landmarks.length < 468) {
            return { pitch: 0, yaw: 0, roll: 0 }
        }

        // Key landmarks for head pose estimation
        const noseTip = landmarks[1]
        const leftEye = landmarks[33]
        const rightEye = landmarks[263]

        // Calculate yaw (left/right rotation)
        const eyeMidpoint = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2,
        }
        const yaw = (noseTip.x - eyeMidpoint.x) * 180 // Simplified calculation

        // Calculate pitch (up/down rotation) - using nose to eye distance
        const pitch = (noseTip.y - eyeMidpoint.y) * 180 // Simplified calculation

        // Calculate roll (tilt)
        const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
        const roll = eyeAngle * (180 / Math.PI)

        return { pitch, yaw, roll }
    }

    // Save detection event to database
    const saveDetectionEvent = async (event: DetectionEvent) => {
        try {
            const { error } = await supabase.functions.invoke('save-cheating-detection', {
                body: {
                    roomId,
                    violationType: event.type,
                    severity: event.severity,
                    confidence: event.confidence,
                    metadata: {
                        timestamp: event.timestamp,
                        attentionScore,
                    },
                },
            })

            if (error) {
                console.error('Failed to save detection event:', error)
            }
        } catch (err) {
            console.error('Error saving detection event:', err)
        }
    }

    // --- AUDIO ANALYSIS ---
    useEffect(() => {
        if (!config.enabled || !videoElement) return

        let audioInterval: ReturnType<typeof setInterval>

        const setupAudioAnalysis = async () => {
            try {
                // Check if video element has a source stream
                const stream = videoElement.srcObject as MediaStream
                if (!stream || stream.getAudioTracks().length === 0) {
                    return
                }

                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
                }

                const audioCtx = audioContextRef.current

                if (!audioSourceRef.current) {
                    try {
                        audioAnalyserRef.current = audioCtx.createAnalyser()
                        audioAnalyserRef.current.fftSize = 256
                        audioSourceRef.current = audioCtx.createMediaStreamSource(stream)
                        audioSourceRef.current.connect(audioAnalyserRef.current)
                    } catch (e) {
                        console.warn('[CheatingDetector] Could not create audio source (likely cross-origin violation or muted)', e)
                        return
                    }
                }

                const analyser = audioAnalyserRef.current
                if (!analyser) return

                const dataArray = new Uint8Array(analyser.frequencyBinCount)

                audioInterval = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray)

                    let sum = 0
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i]
                    }
                    const average = sum / dataArray.length

                    // Threshold check (tuning required - 50 is arbitrary noise floor)
                    if (average > 50) {
                        if (config.sensitivity === 'high' && average > 80) {
                            console.log('[CheatingDetector] High audio level:', average)
                            // Optional: Uncomment to enable strict audio warnings
                            // saveDetectionEvent({ type: 'suspicious_audio', severity: 'low', confidence: 0.6, timestamp: Date.now() })
                        }
                    }
                }, 1000)

            } catch (e) {
                console.error('[CheatingDetector] Audio analysis setup failed:', e)
            }
        }

        setupAudioAnalysis()

        return () => {
            if (audioInterval) clearInterval(audioInterval)
        }

    }, [config.enabled, videoElement])

    // --- BROWSER EVENT LISTENERS ---
    useEffect(() => {
        if (!config.enabled) return

        // 1. Tab Switching (Visibility Change)
        const handleVisibilityChange = () => {
            if (document.hidden) {
                setAttentionScore(prev => Math.max(0, prev - 20))
                setCurrentViolations(prev => [...prev, 'Tab switched'])
                saveDetectionEvent({
                    type: 'tab_switch',
                    severity: 'high',
                    confidence: 1.0,
                    timestamp: Date.now()
                })
            } else {
                setCurrentViolations(prev => prev.filter(v => v !== 'Tab switched'))
            }
        }

        // 2. Mouse Leave
        const handleMouseLeave = () => {
            // Only trigger if leaving the window document
            console.log('[CheatingDetector] Mouse left window')
            saveDetectionEvent({
                type: 'mouse_leave',
                severity: 'low',
                confidence: 0.9,
                timestamp: Date.now()
            })
        }

        // 3. Fullscreen Exit
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setAttentionScore(prev => Math.max(0, prev - 10))
                saveDetectionEvent({
                    type: 'fullscreen_exit',
                    severity: 'medium',
                    confidence: 1.0,
                    timestamp: Date.now()
                })
            }
        }

        // 4. Copy/Paste
        const handleCopy = () => {
            console.log('[CheatingDetector] Copy detected')
            saveDetectionEvent({
                type: 'copy_paste',
                severity: 'medium',
                confidence: 1.0,
                timestamp: Date.now()
            })
        }

        const handlePaste = () => {
            console.log('[CheatingDetector] Paste detected')
            saveDetectionEvent({
                type: 'copy_paste',
                severity: 'medium',
                confidence: 1.0,
                timestamp: Date.now()
            })
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        document.body.addEventListener('mouseleave', handleMouseLeave)
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        document.addEventListener('copy', handleCopy)
        document.addEventListener('paste', handlePaste)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            document.body.removeEventListener('mouseleave', handleMouseLeave)
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            document.removeEventListener('copy', handleCopy)
            document.removeEventListener('paste', handlePaste)
        }
    }, [config.enabled, roomId])

    // Analyze detection results and trigger alerts
    const analyzeDetection = (results: any) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            // No face detected
            setAttentionScore(0)
            setCurrentViolations(['No face detected'])
            return
        }

        const violations: string[] = []
        let score = 100
        const now = Date.now()

        // Check for multiple faces
        if (results.multiFaceLandmarks.length > 1) {
            violations.push('Multiple faces detected')
            score -= 40

            // Throttle alerts (max once per 10 seconds)
            if (!lastAlertTimeRef.current['multiple_faces'] ||
                now - lastAlertTimeRef.current['multiple_faces'] > 10000) {
                const event: DetectionEvent = {
                    type: 'multiple_faces',
                    severity: 'high',
                    confidence: 0.95,
                    timestamp: now,
                }
                detectionHistoryRef.current.push(event)
                saveDetectionEvent(event)
                lastAlertTimeRef.current['multiple_faces'] = now
            }
        }

        const landmarks = results.multiFaceLandmarks[0]

        // Analyze gaze direction
        const gaze = calculateGazeDirection(landmarks)
        if (gaze.direction !== 'center') {
            if (!gazeAwayStartRef.current) {
                gazeAwayStartRef.current = now
            } else if (now - gazeAwayStartRef.current > config.gazeAwayThreshold) {
                violations.push(`Looking ${gaze.direction}`)
                score -= 25

                if (!lastAlertTimeRef.current['eyes_away'] ||
                    now - lastAlertTimeRef.current['eyes_away'] > 5000) {
                    const event: DetectionEvent = {
                        type: 'eyes_away',
                        severity: 'medium',
                        confidence: gaze.confidence,
                        timestamp: now,
                    }
                    detectionHistoryRef.current.push(event)
                    saveDetectionEvent(event)
                    lastAlertTimeRef.current['eyes_away'] = now
                }
            }
        } else {
            gazeAwayStartRef.current = null
        }

        // Analyze head pose
        const headPose = calculateHeadPose(landmarks)
        const headTurnAngle = Math.abs(headPose.yaw)

        if (headTurnAngle > config.headTurnAngleThreshold) {
            if (!headTurnStartRef.current) {
                headTurnStartRef.current = now
            } else if (now - headTurnStartRef.current > 2000) {
                violations.push('Head turned away')
                score -= 30

                if (!lastAlertTimeRef.current['head_turned'] ||
                    now - lastAlertTimeRef.current['head_turned'] > 5000) {
                    const event: DetectionEvent = {
                        type: 'head_turned',
                        severity: 'medium',
                        confidence: 0.85,
                        timestamp: now,
                    }
                    detectionHistoryRef.current.push(event)
                    saveDetectionEvent(event)
                    lastAlertTimeRef.current['head_turned'] = now
                }
            }
        } else {
            headTurnStartRef.current = null
        }

        // Update attention score
        setAttentionScore(Math.max(0, score))
        setCurrentViolations(violations)

        // Check for low attention
        if (score < config.attentionScoreThreshold) {
            if (!lastAlertTimeRef.current['low_attention'] ||
                now - lastAlertTimeRef.current['low_attention'] > 15000) {
                const event: DetectionEvent = {
                    type: 'low_attention',
                    severity: score < 30 ? 'high' : 'medium',
                    confidence: 0.8,
                    timestamp: now,
                }
                detectionHistoryRef.current.push(event)
                saveDetectionEvent(event)
                lastAlertTimeRef.current['low_attention'] = now
            }
        }
    }

    // Initialize MediaPipe Face Mesh
    useEffect(() => {
        if (!config.enabled || !videoElement || !canvasRef.current) {
            console.log('[CheatingDetector] Not initializing:', {
                enabled: config.enabled,
                hasVideo: !!videoElement,
                hasCanvas: !!canvasRef.current,
            })
            return
        }

        console.log('[CheatingDetector] Initializing for room:', roomId)

        const faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            },
        })

        faceMesh.setOptions({
            maxNumFaces: 3,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        })

        faceMesh.onResults((results) => {
            analyzeDetection(results)
        })

        faceMeshRef.current = faceMesh

        // Start camera
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                if (faceMeshRef.current) {
                    await faceMeshRef.current.send({ image: videoElement })
                }
            },
            width: 640,
            height: 480,
        })

        camera.start()
        cameraRef.current = camera
        setIsDetecting(true)
        console.log('[CheatingDetector] Started monitoring')

        return () => {
            console.log('[CheatingDetector] Stopping monitoring')
            camera.stop()
            setIsDetecting(false)
        }
    }, [videoElement, config.enabled, roomId])

    const getScoreColor = () => {
        if (attentionScore >= 80) return '#4caf50'
        if (attentionScore >= 50) return '#ff9800'
        return '#f44336'
    }

    const getStatusText = () => {
        if (!isDetecting) return 'Initializing...'
        if (currentViolations.length === 0) return 'Monitoring'
        return currentViolations.join(', ')
    }

    // Always render canvas for MediaPipe, but only show UI if enabled
    return (
        <>
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {config.enabled && (
                <div className="cheating-detector-overlay">
                    <div className="detection-status">
                        <div
                            className="attention-indicator"
                            style={{ backgroundColor: getScoreColor() }}
                        >
                            <span className="attention-score">{attentionScore}</span>
                        </div>
                        <div className="status-text">
                            <span className={currentViolations.length > 0 ? 'warning' : ''}>
                                {getStatusText()}
                            </span>
                        </div>
                    </div>

                    {currentViolations.length > 0 && (
                        <div className="violation-alert">
                            <span className="alert-icon">⚠️</span>
                            <span className="alert-text">{currentViolations[0]}</span>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
