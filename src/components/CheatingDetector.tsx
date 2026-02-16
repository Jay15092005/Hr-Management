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
    direction: 'center' | 'left' | 'right' | 'up' | 'down' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'above-camera'
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
    const mobileModelRef = useRef<any>(null)
    const isPhoneDetectedRef = useRef<boolean>(false)

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
        gazeAwayThreshold: parseInt(import.meta.env.VITE_GAZE_AWAY_THRESHOLD || '1500'),
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

    // Calculate gaze direction: use iris when available (478 landmarks), else fall back to head pose (468)
    // Calculate gaze direction using iris ("kiki") landmarks for precise eye tracking
    const calculateGazeDirection = (landmarks: any[]): GazeData => {
        if (!landmarks || landmarks.length < 478) {
            return { direction: 'center', confidence: 0 }
        }

        // Left Eye indices (Outer: 33, Inner: 133, Top: 159, Bottom: 145, Iris: 468)
        const leftIris = landmarks[468]
        const leftWidth = Math.abs(landmarks[133].x - landmarks[33].x) || 0.01
        const leftHeight = Math.abs(landmarks[145].y - landmarks[159].y) || 0.01
        const leftX = (leftIris.x - Math.min(landmarks[33].x, landmarks[133].x)) / leftWidth
        const leftY = (leftIris.y - landmarks[159].y) / leftHeight

        // Right Eye indices (Outer: 263, Inner: 362, Top: 386, Bottom: 374, Iris: 473)
        const rightIris = landmarks[473]
        const rightWidth = Math.abs(landmarks[263].x - landmarks[362].x) || 0.01
        const rightHeight = Math.abs(landmarks[374].y - landmarks[386].y) || 0.01
        const rightX = (rightIris.x - Math.min(landmarks[362].x, landmarks[263].x)) / rightWidth
        const rightY = (rightIris.y - landmarks[386].y) / rightHeight

        // Average gaze offsets (Center is ~0.5)
        const avgX = (leftX + rightX) / 2
        const avgY = (leftY + rightY) / 2

        let direction: GazeData['direction'] = 'center'
        let confidence = 0.95

        // Extremely sensitive thresholds for "outside the window" detection
        const xLow = 0.35, xHigh = 0.65
        const yLow = 0.35, yHigh = 0.65
        const yExtremeLow = 0.18 // Looked above the camera

        if (avgY < yExtremeLow) {
            direction = 'above-camera'
        } else if (avgY < yLow && avgX < xLow) {
            direction = 'top-left'
        } else if (avgY < yLow && avgX > xHigh) {
            direction = 'top-right'
        } else if (avgY > yHigh && avgX < xLow) {
            direction = 'bottom-left'
        } else if (avgY > yHigh && avgX > xHigh) {
            direction = 'bottom-right'
        } else if (avgY < yLow) {
            direction = 'up'
        } else if (avgY > yHigh) {
            direction = 'down'
        } else if (avgX < xLow) {
            direction = 'left'
        } else if (avgX > xHigh) {
            direction = 'right'
        }

        return { direction, confidence }
    }

    // Calculate head pose from face landmarks (normalized 0–1; scaled so ~0.1 offset ≈ 15–20°)
    const calculateHeadPose = (landmarks: any[]): HeadPose => {
        if (!landmarks || landmarks.length < 468) {
            return { pitch: 0, yaw: 0, roll: 0 }
        }

        const noseTip = landmarks[1]
        const leftEye = landmarks[33]
        const rightEye = landmarks[263]
        const eyeMidpoint = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2,
        }
        const scale = 220
        const yaw = (noseTip.x - eyeMidpoint.x) * scale
        const pitch = (noseTip.y - eyeMidpoint.y) * scale
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

    // Draw gaze indicators on canvas
    const drawGaze = (results: any) => {
        const canvas = canvasRef.current
        if (!canvas || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const landmarks = results.multiFaceLandmarks[0]

        // Face bounding box (subtle)
        let minX = 1, minY = 1, maxX = 0, maxY = 0
        landmarks.forEach((p: any) => {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        })

        const w = canvas.width
        const h = canvas.height

        ctx.strokeStyle = getScoreColor()
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.strokeRect(minX * w, minY * h, (maxX - minX) * w, (maxY - minY) * h)
        ctx.setLineDash([])

        // Gaze line for eyes
        const drawEyeGaze = (irisIdx: number) => {
            const iris = landmarks[irisIdx]
            const eyeX = iris.x * w
            const eyeY = iris.y * h

            // Calculate relative offset for gaze vector
            const gaze = calculateGazeDirection(landmarks)
            if (gaze.direction === 'center') return

            ctx.beginPath()
            ctx.moveTo(eyeX, eyeY)

            let dx = 0, dy = 0
            const len = 30

            if (gaze.direction.includes('left')) dx = -len
            if (gaze.direction.includes('right')) dx = len
            if (gaze.direction.includes('up') || gaze.direction.includes('camera')) dy = -len
            if (gaze.direction.includes('down')) dy = len

            ctx.lineTo(eyeX + dx, eyeY + dy)
            ctx.strokeStyle = '#ef4444'
            ctx.lineWidth = 2
            ctx.stroke()

            // Draw a dot at the iris
            ctx.fillStyle = '#ef4444'
            ctx.beginPath()
            ctx.arc(eyeX, eyeY, 2, 0, 2 * Math.PI)
            ctx.fill()
        }

        drawEyeGaze(468) // Left
        drawEyeGaze(473) // Right
    }

    // Analyze detection results and trigger alerts
    const analyzeDetection = (results: any) => {
        // Draw visual indicators
        drawGaze(results)

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            // No face detected
            setAttentionScore(0)
            setCurrentViolations(['No face detected'])
            return
        }

        const violations: string[] = []
        let score = 100
        const now = Date.now()

        // Deduct for mobile phone
        if (isPhoneDetectedRef.current) {
            score -= 50
        }

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

        // Head pose first (used for both head-turn and gaze fallback)
        const headPose = calculateHeadPose(landmarks)
        const headTurnAngle = Math.abs(headPose.yaw)

        // Analyze gaze direction
        const gaze = calculateGazeDirection(landmarks)
        const isGazeAway = gaze.direction !== 'center'
        if (isGazeAway) {
            if (!gazeAwayStartRef.current) gazeAwayStartRef.current = now
            const gazeAwayDuration = now - (gazeAwayStartRef.current ?? now)

            // Map internal direction to user-friendly messages
            let displayMsg = 'Watching outside the window'
            switch (gaze.direction) {
                case 'above-camera': displayMsg = 'Looking ABOVE CAMERA'; break;
                case 'up': displayMsg = 'Looking ABOVE WINDOW'; break;
                case 'down': displayMsg = 'Looking BOTTOM (Outside Screen)'; break;
                case 'left': displayMsg = 'Looking LEFT (Outside Window)'; break;
                case 'right': displayMsg = 'Looking RIGHT (Outside Window)'; break;
                case 'top-left': displayMsg = 'Looking TOP-LEFT Corner'; break;
                case 'top-right': displayMsg = 'Looking TOP-RIGHT Corner'; break;
                case 'bottom-left': displayMsg = 'Looking BOTTOM-LEFT Corner'; break;
                case 'bottom-right': displayMsg = 'Looking BOTTOM-RIGHT Corner'; break;
            }

            violations.push(displayMsg)
            score -= (gaze.direction === 'above-camera' ? 40 : 25)

            // Log to DB only after sustained gaze away (throttled)
            if (gazeAwayDuration > config.gazeAwayThreshold &&
                (!lastAlertTimeRef.current['eyes_away'] || now - lastAlertTimeRef.current['eyes_away'] > 5000)) {
                saveDetectionEvent({
                    type: 'eyes_away',
                    severity: gaze.direction === 'above-camera' ? 'high' : 'medium',
                    confidence: gaze.confidence,
                    timestamp: now,
                })
                lastAlertTimeRef.current['eyes_away'] = now
            }
        } else {
            gazeAwayStartRef.current = null
        }

        // Head turned away (lower threshold so it actually triggers)
        const headThreshold = Math.min(config.headTurnAngleThreshold, 25)
        if (headTurnAngle > headThreshold) {
            if (!headTurnStartRef.current) headTurnStartRef.current = now
            const headAwayDuration = now - (headTurnStartRef.current ?? now)
            if (headAwayDuration > 1500) {
                const headDir = headPose.yaw > 0 ? 'RIGHT' : 'LEFT'
                violations.push(`Watching outside the window (${headDir})`)
                score -= 30
                if (!lastAlertTimeRef.current['head_turned'] || now - lastAlertTimeRef.current['head_turned'] > 5000) {
                    saveDetectionEvent({
                        type: 'head_turned',
                        severity: 'medium',
                        confidence: 0.85,
                        timestamp: now,
                    })
                    lastAlertTimeRef.current['head_turned'] = now
                }
            }
        } else {
            headTurnStartRef.current = null
        }

        // Update attention score
        setAttentionScore(Math.max(0, score))

        // Add mobile phone violation if currently detected
        if (isPhoneDetectedRef.current) {
            violations.push('Mobile phone detected')
        }

        setCurrentViolations(Array.from(new Set(violations)))

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

    // Initialize MediaPipe Face Mesh AND Object Detection
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

        // Load COCO-SSD for mobile detection
        const loadMobileModel = async () => {
            try {
                if ((window as any).cocoSsd) {
                    mobileModelRef.current = await (window as any).cocoSsd.load()
                    console.log('[CheatingDetector] COCO-SSD loaded')
                } else {
                    console.warn('[CheatingDetector] cocoSsd not found on window')
                }
            } catch (err) {
                console.error('[CheatingDetector] Failed to load COCO-SSD:', err)
            }
        }
        loadMobileModel()

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

        // Detection throttle for mobile phone
        let lastMobileDetection = 0

        // Start camera
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                if (faceMeshRef.current) {
                    await faceMeshRef.current.send({ image: videoElement })
                }

                // Check for mobile phone every 1.5 seconds to save resources
                const now = Date.now()
                if (mobileModelRef.current && now - lastMobileDetection > 1500) {
                    lastMobileDetection = now
                    try {
                        const predictions = await mobileModelRef.current.detect(videoElement)
                        const phone = predictions.find((p: any) =>
                            (p.class === 'cell phone' || p.class === 'phone') && p.score > 0.6
                        )

                        if (phone) {
                            console.log('[CheatingDetector] Mobile phone detected!', phone)
                            isPhoneDetectedRef.current = true
                            setAttentionScore(prev => Math.max(0, prev - 50))

                            if (!lastAlertTimeRef.current['mobile_phone'] ||
                                now - lastAlertTimeRef.current['mobile_phone'] > 10000) {
                                saveDetectionEvent({
                                    type: 'mobile_phone',
                                    severity: 'high',
                                    confidence: phone.score,
                                    timestamp: now
                                })
                                lastAlertTimeRef.current['mobile_phone'] = now
                            }
                        } else {
                            isPhoneDetectedRef.current = false
                        }
                    } catch (err) {
                        console.error('[CheatingDetector] Mobile detection error:', err)
                    }
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


    // Always render canvas for MediaPipe, but only show UI if enabled
    return (
        <>
            {config.enabled && (
                <div className="cheating-detector-overlay">
                    <canvas
                        ref={canvasRef}
                        className="gaze-canvas"
                        width={640}
                        height={480}
                    />

                    <div className="detection-status">
                        <div
                            className="attention-indicator"
                            style={{ '--score-color': getScoreColor() } as any}
                        >
                            <span className="attention-score">{attentionScore}</span>
                            <span className="attention-label">Score</span>
                        </div>
                        <div className="status-text">
                            {currentViolations.length > 0 ? (
                                <span className="warning">
                                    {currentViolations[0]}
                                </span>
                            ) : (
                                <div className="monitoring-label">
                                    <div className="monitoring-dot" />
                                    <span>Monitoring Active</span>
                                </div>
                            )}
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
