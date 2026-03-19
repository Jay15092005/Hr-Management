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

type GazeDirection =
    | 'center'
    | 'left'
    | 'right'
    | 'up'
    | 'down'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'above-camera'

interface GazeData {
    direction: GazeDirection
    confidence: number
    rawX: number  // normalized iris X position in eye (0=left edge, 1=right edge)
    rawY: number  // normalized iris Y position in eye (0=top edge, 1=bottom edge)
}

interface HeadPose {
    pitch: number
    yaw: number
    roll: number
}

// Gaze direction display config
const GAZE_CONFIG: Record<GazeDirection, { label: string; emoji: string; dx: number; dy: number }> = {
    'center': { label: 'Looking at Screen', emoji: '✅', dx: 0, dy: 0 },
    'left': { label: '👁️ Looking LEFT (Outside)', emoji: '⬅️', dx: -1, dy: 0 },
    'right': { label: '👁️ Looking RIGHT (Outside)', emoji: '➡️', dx: 1, dy: 0 },
    'up': { label: '👁️ Looking UP (Outside)', emoji: '⬆️', dx: 0, dy: -1 },
    'down': { label: '👁️ Looking DOWN (Outside)', emoji: '⬇️', dx: 0, dy: 1 },
    'top-left': { label: '👁️ Looking TOP-LEFT Corner', emoji: '↖️', dx: -1, dy: -1 },
    'top-right': { label: '👁️ Looking TOP-RIGHT Corner', emoji: '↗️', dx: 1, dy: -1 },
    'bottom-left': { label: '👁️ Looking BOTTOM-LEFT', emoji: '↙️', dx: -1, dy: 1 },
    'bottom-right': { label: '👁️ Looking BOTTOM-RIGHT', emoji: '↘️', dx: 1, dy: 1 },
    'above-camera': { label: '👁️ Looking ABOVE CAMERA', emoji: '🔺', dx: 0, dy: -2 },
}

// ─── Gaze smoothing buffer ─────────────────────────────────────────────────
const SMOOTHING_FRAMES = 6  // rolling window size

export default function CheatingDetector({ videoElement, roomId, enabled = true }: CheatingDetectorProps) {
    const [attentionScore, setAttentionScore] = useState(100)
    const [currentViolations, setCurrentViolations] = useState<string[]>([])
    const [gazeDirection, setGazeDirection] = useState<GazeDirection>('center')
    const [isDetecting, setIsDetecting] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const faceMeshRef = useRef<FaceMesh | null>(null)
    const cameraRef = useRef<Camera | null>(null)
    const detectionHistoryRef = useRef<DetectionEvent[]>([])
    const lastAlertTimeRef = useRef<{ [key: string]: number }>({})
    const mobileModelRef = useRef<any>(null)
    const isPhoneDetectedRef = useRef<boolean>(false)

    // Tracking start times for sustained violations → DB logging
    const gazeAwayStartRef = useRef<number | null>(null)
    const headTurnStartRef = useRef<number | null>(null)

    // Gaze smoothing buffer: keeps last N raw gaze vectors
    const gazeBufferRef = useRef<Array<{ x: number; y: number }>>([])

    // Audio refs
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioAnalyserRef = useRef<AnalyserNode | null>(null)
    const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

    const config = {
        enabled: import.meta.env.VITE_ENABLE_CHEATING_DETECTION === 'true' && enabled,
        sensitivity: import.meta.env.VITE_DETECTION_SENSITIVITY || 'medium',
        gazeAwayThreshold: parseInt(import.meta.env.VITE_GAZE_AWAY_THRESHOLD || '1500'),
        headTurnAngleThreshold: parseInt(import.meta.env.VITE_HEAD_TURN_ANGLE_THRESHOLD || '30'),
        attentionScoreThreshold: parseInt(import.meta.env.VITE_ATTENTION_SCORE_THRESHOLD || '50'),
    }

    console.log('[CheatingDetector] Config:', {
        envEnabled: import.meta.env.VITE_ENABLE_CHEATING_DETECTION,
        propEnabled: enabled,
        finalEnabled: config.enabled,
        hasVideo: !!videoElement,
    })

    // ─── Core iris-ratio gaze calculation ────────────────────────────────────
    /**
     * Extracts normalized iris position inside each eye using iris landmark indices.
     * Works regardless of blinks — uses current iris centroid vs eye-corner span.
     *
     * Left eye corners: outer=33, inner=133, top=159, bottom=145, iris centroid=468
     * Right eye corners: outer=263, inner=362, top=386, bottom=374, iris centroid=473
     *
     * Returns { x, y } where (0.5, 0.5) = perfectly centered; values outside [0,1]
     * mean the iris has shifted beyond the corner references.
     */
    const getIrisRatios = (landmarks: any[]): { x: number; y: number } | null => {
        if (!landmarks || landmarks.length < 478) return null

        // ── Left eye ──────────────────────────────────────────────────────
        const lOuter = landmarks[33]   // left end of left eye
        const lInner = landmarks[133]  // right end of left eye
        const lTop = landmarks[159]
        const lBot = landmarks[145]
        const lIris = landmarks[468]  // left iris center

        const lW = Math.abs(lInner.x - lOuter.x) || 0.001
        const lH = Math.abs(lBot.y - lTop.y) || 0.001
        const lX = (lIris.x - lOuter.x) / lW     // 0 = at outer corner, 1 = at inner corner
        const lY = (lIris.y - lTop.y) / lH     // 0 = top lid, 1 = bottom lid

        // ── Right eye ─────────────────────────────────────────────────────
        const rInner = landmarks[362]  // left end of right eye
        const rOuter = landmarks[263]  // right end of right eye
        const rTop = landmarks[386]
        const rBot = landmarks[374]
        const rIris = landmarks[473]  // right iris center

        const rW = Math.abs(rOuter.x - rInner.x) || 0.001
        const rH = Math.abs(rBot.y - rTop.y) || 0.001
        const rX = (rIris.x - rInner.x) / rW
        const rY = (rIris.y - rTop.y) / rH

        // Average both eyes → single gaze vector
        return {
            x: (lX + rX) / 2,
            y: (lY + rY) / 2,
        }
    }

    /** Push to rolling buffer and return smoothed average */
    const smoothGaze = (raw: { x: number; y: number }): { x: number; y: number } => {
        const buf = gazeBufferRef.current
        buf.push(raw)
        if (buf.length > SMOOTHING_FRAMES) buf.shift()
        const avg = buf.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 })
        return { x: avg.x / buf.length, y: avg.y / buf.length }
    }

    /**
     * Full gaze direction calculation:
     * 1. Try iris landmarks (478 points, refineLandmarks=true)
     * 2. Apply temporal smoothing
     * 3. Classify into 9 directions using tight thresholds
     * 4. Head-pose fusion: if head is also turned, upgrade confidence
     */
    const calculateGazeDirection = (landmarks: any[], headPose: HeadPose): GazeData => {
        const raw = getIrisRatios(landmarks)

        if (!raw) {
            // Fallback: head-pose only
            const yaw = headPose.yaw
            const pitch = headPose.pitch
            let dir: GazeDirection = 'center'
            if (Math.abs(yaw) > 20 || Math.abs(pitch) > 20) {
                if (yaw < -20 && pitch < -10) dir = 'top-left'
                else if (yaw > 20 && pitch < -10) dir = 'top-right'
                else if (yaw < -20 && pitch > 10) dir = 'bottom-left'
                else if (yaw > 20 && pitch > 10) dir = 'bottom-right'
                else if (yaw < -20) dir = 'left'
                else if (yaw > 20) dir = 'right'
                else if (pitch < -20) dir = 'up'
                else if (pitch > 20) dir = 'down'
            }
            return { direction: dir, confidence: 0.6, rawX: 0.5, rawY: 0.5 }
        }

        const smoothed = smoothGaze(raw)
        const { x, y } = smoothed

        // ── Classification thresholds ─────────────────────────────────────
        // Iris center when looking straight ahead ≈ 0.5
        // Thresholds tuned to be tight so even slight deviations register
        const X_LEFT_EDGE = 0.38   // iris shifted toward outer corner → looking left
        const X_RIGHT_EDGE = 0.62   // iris shifted toward inner corner → looking right
        const Y_UP_EDGE = 0.38   // iris at top of eye opening → looking up
        const Y_DOWN_EDGE = 0.62   // iris at bottom of eye opening → looking down
        const Y_EXTREME_UP = 0.25   // extreme upward → above camera

        let direction: GazeDirection = 'center'
        let confidence = 0.95

        const lookLeft = x < X_LEFT_EDGE
        const lookRight = x > X_RIGHT_EDGE
        const lookUp = y < Y_UP_EDGE
        const lookDown = y > Y_DOWN_EDGE
        const lookWayUp = y < Y_EXTREME_UP

        if (lookWayUp) {
            direction = 'above-camera'
        } else if (lookUp && lookLeft) {
            direction = 'top-left'
        } else if (lookUp && lookRight) {
            direction = 'top-right'
        } else if (lookDown && lookLeft) {
            direction = 'bottom-left'
        } else if (lookDown && lookRight) {
            direction = 'bottom-right'
        } else if (lookLeft) {
            direction = 'left'
        } else if (lookRight) {
            direction = 'right'
        } else if (lookUp) {
            direction = 'up'
        } else if (lookDown) {
            direction = 'down'
        }

        // Head-pose fusion: if head IS turned the same way, boost confidence
        const headCorroborates =
            (direction.includes('left') && headPose.yaw < -10) ||
            (direction.includes('right') && headPose.yaw > 10) ||
            (direction.includes('up') && headPose.pitch < -10) ||
            (direction.includes('down') && headPose.pitch > 10)
        if (headCorroborates) confidence = Math.min(1, confidence + 0.04)

        return { direction, confidence, rawX: x, rawY: y }
    }

    // ─── Head pose ───────────────────────────────────────────────────────────
    const calculateHeadPose = (landmarks: any[]): HeadPose => {
        if (!landmarks || landmarks.length < 468) return { pitch: 0, yaw: 0, roll: 0 }

        const noseTip = landmarks[1]
        const leftEye = landmarks[33]
        const rightEye = landmarks[263]
        const chin = landmarks[152]
        const forehead = landmarks[10]

        const eyeMidX = (leftEye.x + rightEye.x) / 2
        const eyeMidY = (leftEye.y + rightEye.y) / 2

        const scale = 220
        const yaw = (noseTip.x - eyeMidX) * scale
        const pitch = (noseTip.y - eyeMidY) * scale

        // Roll: angle of eye line
        const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)
        const roll = eyeAngle * (180 / Math.PI)

        // Additional: face vertical symmetry check
        const faceH = Math.abs(chin.y - forehead.y)
        const noseAboveMid = (noseTip.y - forehead.y) / (faceH || 0.01)

        return { pitch, yaw, roll }
    }

    // ─── Save to DB ──────────────────────────────────────────────────────────
    const saveDetectionEvent = async (event: DetectionEvent) => {
        try {
            const { error } = await supabase.functions.invoke('save-cheating-detection', {
                body: {
                    roomId,
                    violationType: event.type,
                    severity: event.severity,
                    confidence: event.confidence,
                    metadata: { timestamp: event.timestamp, attentionScore },
                },
            })
            if (error) console.error('Failed to save detection event:', error)
        } catch (err) {
            console.error('Error saving detection event:', err)
        }
    }

    // ─── Audio analysis ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!config.enabled || !videoElement) return

        let audioInterval: ReturnType<typeof setInterval>

        const setupAudioAnalysis = async () => {
            try {
                const stream = videoElement.srcObject as MediaStream
                if (!stream || stream.getAudioTracks().length === 0) return

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
                        console.warn('[CheatingDetector] Could not create audio source', e)
                        return
                    }
                }

                const analyser = audioAnalyserRef.current
                if (!analyser) return

                const dataArray = new Uint8Array(analyser.frequencyBinCount)
                audioInterval = setInterval(() => {
                    analyser.getByteFrequencyData(dataArray)
                    let sum = 0
                    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
                    const average = sum / dataArray.length
                    if (average > 50 && config.sensitivity === 'high' && average > 80) {
                        console.log('[CheatingDetector] High audio level:', average)
                    }
                }, 1000)
            } catch (e) {
                console.error('[CheatingDetector] Audio analysis setup failed:', e)
            }
        }

        setupAudioAnalysis()
        return () => { if (audioInterval) clearInterval(audioInterval) }
    }, [config.enabled, videoElement])

    // ─── Browser event listeners ─────────────────────────────────────────────
    useEffect(() => {
        if (!config.enabled) return

        const handleVisibilityChange = () => {
            if (document.hidden) {
                setAttentionScore(prev => Math.max(0, prev - 20))
                setCurrentViolations(prev => [...prev, 'Tab switched'])
                saveDetectionEvent({ type: 'tab_switch', severity: 'high', confidence: 1.0, timestamp: Date.now() })
            } else {
                setCurrentViolations(prev => prev.filter(v => v !== 'Tab switched'))
            }
        }

        const handleMouseLeave = () => {
            console.log('[CheatingDetector] Mouse left window')
            saveDetectionEvent({ type: 'mouse_leave', severity: 'low', confidence: 0.9, timestamp: Date.now() })
        }

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setAttentionScore(prev => Math.max(0, prev - 10))
                saveDetectionEvent({ type: 'fullscreen_exit', severity: 'medium', confidence: 1.0, timestamp: Date.now() })
            }
        }

        const handleCopy = () => {
            saveDetectionEvent({ type: 'copy_paste', severity: 'medium', confidence: 1.0, timestamp: Date.now() })
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        document.body.addEventListener('mouseleave', handleMouseLeave)
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        document.addEventListener('copy', handleCopy)
        document.addEventListener('paste', handleCopy)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            document.body.removeEventListener('mouseleave', handleMouseLeave)
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            document.removeEventListener('copy', handleCopy)
            document.removeEventListener('paste', handleCopy)
        }
    }, [config.enabled, roomId])

    // ─── Canvas drawing ──────────────────────────────────────────────────────
    const drawGaze = (results: any, gaze: GazeData, headPose: HeadPose) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return

        const landmarks = results.multiFaceLandmarks[0]
        const w = canvas.width
        const h = canvas.height

        // ── Face bounding box ──────────────────────────────────────────────
        let minX = 1, minY = 1, maxX = 0, maxY = 0
        landmarks.forEach((p: any) => {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        })

        const isAway = gaze.direction !== 'center'
        const faceColor = isAway ? '#ef4444' : '#22c55e'

        ctx.strokeStyle = faceColor
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 5])
        ctx.strokeRect(minX * w, minY * h, (maxX - minX) * w, (maxY - minY) * h)
        ctx.setLineDash([])

        // ── Draw iris dots + gaze vectors ──────────────────────────────────
        const drawIrisGaze = (irisIdx: number) => {
            if (landmarks.length <= irisIdx) return
            const iris = landmarks[irisIdx]
            const eyeX = iris.x * w
            const eyeY = iris.y * h

            // Iris dot
            ctx.fillStyle = isAway ? '#ef4444' : '#22c55e'
            ctx.beginPath()
            ctx.arc(eyeX, eyeY, 3, 0, 2 * Math.PI)
            ctx.fill()

            // Gaze vector arrow
            if (isAway) {
                const cfg = GAZE_CONFIG[gaze.direction]
                const arrowLen = 28
                const dx = cfg.dx * arrowLen
                const dy = cfg.dy * arrowLen

                // Arrow shaft
                ctx.beginPath()
                ctx.moveTo(eyeX, eyeY)
                ctx.lineTo(eyeX + dx, eyeY + dy)
                ctx.strokeStyle = '#ef4444'
                ctx.lineWidth = 2.5
                ctx.stroke()

                // Arrowhead
                const angle = Math.atan2(dy, dx)
                const headLen = 8
                ctx.beginPath()
                ctx.moveTo(eyeX + dx, eyeY + dy)
                ctx.lineTo(
                    eyeX + dx - headLen * Math.cos(angle - Math.PI / 6),
                    eyeY + dy - headLen * Math.sin(angle - Math.PI / 6)
                )
                ctx.moveTo(eyeX + dx, eyeY + dy)
                ctx.lineTo(
                    eyeX + dx - headLen * Math.cos(angle + Math.PI / 6),
                    eyeY + dy - headLen * Math.sin(angle + Math.PI / 6)
                )
                ctx.strokeStyle = '#ef4444'
                ctx.lineWidth = 2
                ctx.stroke()
            }
        }

        if (landmarks.length >= 478) {
            drawIrisGaze(468)  // Left iris
            drawIrisGaze(473)  // Right iris
        }

        // ── Head pose indicator ────────────────────────────────────────────
        const noseX = landmarks[1].x * w
        const noseY = landmarks[1].y * h
        const headArrowLen = 20
        const headDx = (headPose.yaw / 45) * headArrowLen
        const headDy = (headPose.pitch / 45) * headArrowLen

        if (Math.abs(headPose.yaw) > 8 || Math.abs(headPose.pitch) > 8) {
            ctx.beginPath()
            ctx.moveTo(noseX, noseY)
            ctx.lineTo(noseX + headDx, noseY + headDy)
            ctx.strokeStyle = '#f59e0b'
            ctx.lineWidth = 2
            ctx.stroke()

            ctx.fillStyle = '#f59e0b'
            ctx.beginPath()
            ctx.arc(noseX + headDx, noseY + headDy, 3, 0, 2 * Math.PI)
            ctx.fill()
        }

        // ── Gaze direction overlay text ────────────────────────────────────
        if (isAway) {
            const cfg = GAZE_CONFIG[gaze.direction]
            ctx.font = 'bold 13px Inter, sans-serif'
            ctx.textAlign = 'center'
            const textY = minY * h - 10 > 20 ? minY * h - 10 : maxY * h + 20
            const textX = ((minX + maxX) / 2) * w

            // Background
            const text = cfg.label
            const tm = ctx.measureText(text)
            ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'
            ctx.roundRect?.(textX - tm.width / 2 - 8, textY - 16, tm.width + 16, 22, 4)
            ctx.fill()

            ctx.fillStyle = '#ffffff'
            ctx.fillText(text, textX, textY)
        }
    }

    // ─── Main face analysis ──────────────────────────────────────────────────
    const analyzeDetection = (results: any) => {
        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            setAttentionScore(0)
            setCurrentViolations(['No face detected'])
            setGazeDirection('center')
            const canvas = canvasRef.current
            if (canvas) {
                const ctx = canvas.getContext('2d')
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
            return
        }

        const violations: string[] = []
        let score = 100
        const now = Date.now()

        // ── Multiple faces ─────────────────────────────────────────────────
        if (isPhoneDetectedRef.current) score -= 50

        if (results.multiFaceLandmarks.length > 1) {
            violations.push('Multiple faces detected')
            score -= 40
            if (!lastAlertTimeRef.current['multiple_faces'] ||
                now - lastAlertTimeRef.current['multiple_faces'] > 10000) {
                const event: DetectionEvent = { type: 'multiple_faces', severity: 'high', confidence: 0.95, timestamp: now }
                detectionHistoryRef.current.push(event)
                saveDetectionEvent(event)
                lastAlertTimeRef.current['multiple_faces'] = now
            }
        }

        const landmarks = results.multiFaceLandmarks[0]

        // ── Head pose ──────────────────────────────────────────────────────
        const headPose = calculateHeadPose(landmarks)

        // ── Gaze (iris + head fusion) ──────────────────────────────────────
        const gaze = calculateGazeDirection(landmarks, headPose)
        const isGazeAway = gaze.direction !== 'center'

        // Update gaze direction state IMMEDIATELY (no delay) for UI
        setGazeDirection(gaze.direction)

        // ── Draw visuals ───────────────────────────────────────────────────
        drawGaze(results, gaze, headPose)

        if (isGazeAway) {
            if (!gazeAwayStartRef.current) gazeAwayStartRef.current = now
            const gazeAwayDuration = now - (gazeAwayStartRef.current ?? now)

            const cfg = GAZE_CONFIG[gaze.direction]
            violations.push(cfg.label)
            score -= gaze.direction === 'above-camera' ? 40 : 25

            // Log to DB after sustained gaze (throttled)
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

        // ── Head turn ──────────────────────────────────────────────────────
        const headThreshold = Math.min(config.headTurnAngleThreshold, 25)
        const headTurnAngle = Math.abs(headPose.yaw)
        if (headTurnAngle > headThreshold) {
            if (!headTurnStartRef.current) headTurnStartRef.current = now
            const headAwayDuration = now - (headTurnStartRef.current ?? now)
            if (headAwayDuration > 1000) {
                const headDir = headPose.yaw > 0 ? 'RIGHT' : 'LEFT'
                // Only add if gaze didn't already add a violation for same direction
                if (!isGazeAway) {
                    violations.push(`Head turned ${headDir} (outside window)`)
                    score -= 25
                }
                if (!lastAlertTimeRef.current['head_turned'] || now - lastAlertTimeRef.current['head_turned'] > 5000) {
                    saveDetectionEvent({ type: 'head_turned', severity: 'medium', confidence: 0.85, timestamp: now })
                    lastAlertTimeRef.current['head_turned'] = now
                }
            }
        } else {
            headTurnStartRef.current = null
        }

        // ── Finals ─────────────────────────────────────────────────────────
        if (isPhoneDetectedRef.current) violations.push('Mobile phone detected')

        setAttentionScore(Math.max(0, score))
        setCurrentViolations(Array.from(new Set(violations)))

        if (score < config.attentionScoreThreshold) {
            if (!lastAlertTimeRef.current['low_attention'] || now - lastAlertTimeRef.current['low_attention'] > 15000) {
                const event: DetectionEvent = { type: 'low_attention', severity: score < 30 ? 'high' : 'medium', confidence: 0.8, timestamp: now }
                detectionHistoryRef.current.push(event)
                saveDetectionEvent(event)
                lastAlertTimeRef.current['low_attention'] = now
            }
        }
    }

    // ─── MediaPipe initialization ─────────────────────────────────────────────
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

        // COCO-SSD for mobile detection
        const loadMobileModel = async () => {
            try {
                if ((window as any).cocoSsd) {
                    mobileModelRef.current = await (window as any).cocoSsd.load()
                    console.log('[CheatingDetector] COCO-SSD loaded')
                }
            } catch (err) {
                console.error('[CheatingDetector] Failed to load COCO-SSD:', err)
            }
        }
        loadMobileModel()

        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        })

        faceMesh.setOptions({
            maxNumFaces: 3,
            refineLandmarks: true,   // ← CRITICAL: enables iris landmarks (468-477)
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        })

        faceMesh.onResults((results) => {
            analyzeDetection(results)
        })

        faceMeshRef.current = faceMesh

        let lastMobileDetection = 0

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                if (faceMeshRef.current) {
                    await faceMeshRef.current.send({ image: videoElement })
                }

                const now = Date.now()
                if (mobileModelRef.current && now - lastMobileDetection > 1500) {
                    lastMobileDetection = now
                    try {
                        const predictions = await mobileModelRef.current.detect(videoElement)
                        const phone = predictions.find((p: any) =>
                            (p.class === 'cell phone' || p.class === 'phone') && p.score > 0.6
                        )
                        if (phone) {
                            isPhoneDetectedRef.current = true
                            if (!lastAlertTimeRef.current['mobile_phone'] || now - lastAlertTimeRef.current['mobile_phone'] > 10000) {
                                saveDetectionEvent({ type: 'mobile_phone' as any, severity: 'high', confidence: phone.score, timestamp: now })
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
            gazeBufferRef.current = []
        }
    }, [videoElement, config.enabled, roomId])

    const getScoreColor = () => {
        if (attentionScore >= 80) return '#22c55e'
        if (attentionScore >= 50) return '#f59e0b'
        return '#ef4444'
    }

    const gazeAway = gazeDirection !== 'center'
    const gazeCfg = GAZE_CONFIG[gazeDirection]

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

                    {/* ── Attention score + status ── */}
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
                                <span className="warning">{currentViolations[0]}</span>
                            ) : (
                                <div className="monitoring-label">
                                    <div className="monitoring-dot" />
                                    <span>Monitoring Active</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Gaze direction compass ── */}
                    <div className={`gaze-compass ${gazeAway ? 'gaze-compass--alert' : ''}`}>
                        <div className="gaze-compass-grid">
                            {/* Row 1: top-left, up, top-right */}
                            <GazeCell dir="top-left" active={gazeDirection} />
                            <GazeCell dir="up" active={gazeDirection} />
                            <GazeCell dir="top-right" active={gazeDirection} />
                            {/* Row 2: left, center, right */}
                            <GazeCell dir="left" active={gazeDirection} />
                            <GazeCell dir="center" active={gazeDirection} center />
                            <GazeCell dir="right" active={gazeDirection} />
                            {/* Row 3: bottom-left, down, bottom-right */}
                            <GazeCell dir="bottom-left" active={gazeDirection} />
                            <GazeCell dir="down" active={gazeDirection} />
                            <GazeCell dir="bottom-right" active={gazeDirection} />
                        </div>
                        <div className="gaze-compass-label">Eye Gaze</div>
                    </div>

                    {/* ── Violation alert banner ── */}
                    {currentViolations.length > 0 && (
                        <div className="violation-alert">
                            <span className="alert-icon">{gazeCfg.emoji}</span>
                            <span className="alert-text">{currentViolations[0]}</span>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

// ─── Gaze compass cell sub-component ─────────────────────────────────────────
function GazeCell({
    dir,
    active,
    center = false,
}: {
    dir: GazeDirection
    active: GazeDirection
    center?: boolean
}) {
    const isActive = active === dir
    const cfg = GAZE_CONFIG[dir]

    return (
        <div
            className={[
                'gaze-cell',
                isActive ? 'gaze-cell--active' : '',
                center ? 'gaze-cell--center' : '',
                dir === 'center' && active === 'center' ? 'gaze-cell--ok' : '',
            ].join(' ')}
            title={cfg.label}
        >
            <span className="gaze-cell-emoji">{cfg.emoji}</span>
        </div>
    )
}
