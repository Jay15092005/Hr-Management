import { useEffect } from 'react'

export default function EnvTest() {
    useEffect(() => {
        console.log('=== ENVIRONMENT VARIABLES TEST ===')
        console.log('VITE_ENABLE_CHEATING_DETECTION:', import.meta.env.VITE_ENABLE_CHEATING_DETECTION)
        console.log('VITE_CHEATING_DETECTION_TEST_MODE:', import.meta.env.VITE_CHEATING_DETECTION_TEST_MODE)
        console.log('VITE_DETECTION_SENSITIVITY:', import.meta.env.VITE_DETECTION_SENSITIVITY)
        console.log('VITE_GAZE_AWAY_THRESHOLD:', import.meta.env.VITE_GAZE_AWAY_THRESHOLD)
        console.log('=== END TEST ===')
    }, [])

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace' }}>
            <h2>Environment Variables Test</h2>
            <p>Check the browser console for values</p>
            <ul>
                <li>VITE_ENABLE_CHEATING_DETECTION: {import.meta.env.VITE_ENABLE_CHEATING_DETECTION || 'undefined'}</li>
                <li>VITE_CHEATING_DETECTION_TEST_MODE: {import.meta.env.VITE_CHEATING_DETECTION_TEST_MODE || 'undefined'}</li>
                <li>VITE_DETECTION_SENSITIVITY: {import.meta.env.VITE_DETECTION_SENSITIVITY || 'undefined'}</li>
                <li>VITE_GAZE_AWAY_THRESHOLD: {import.meta.env.VITE_GAZE_AWAY_THRESHOLD || 'undefined'}</li>
            </ul>
        </div>
    )
}
