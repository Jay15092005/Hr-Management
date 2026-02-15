# Cheating Detection System

Real-time monitoring system for detecting suspicious behavior during video interviews using AI-powered face detection and gaze tracking.

## Features

- **👁️ Eye Tracking**: Monitors where the candidate is looking using MediaPipe Face Mesh
- **🎯 Gaze Direction Analysis**: Detects when eyes move away from the screen
- **👤 Multiple Face Detection**: Alerts if more than one person appears in frame
- **📐 Head Pose Estimation**: Tracks head rotation to detect looking away
- **📊 Attention Scoring**: Real-time attention score (0-100) based on behavior
- **⚠️ Smart Alerts**: Configurable thresholds with severity levels
- **💾 Event Logging**: All violations saved to database with timestamps
- **🔒 Privacy-First**: All processing happens client-side; only events are logged

## How It Works

### Detection Pipeline

1. **Video Capture**: Candidate's webcam feed is processed in real-time
2. **Face Detection**: MediaPipe Face Mesh detects facial landmarks (468 points)
3. **Analysis**: Multiple algorithms analyze:
   - Iris position for gaze direction
   - Facial geometry for head pose
   - Face count for multiple people
4. **Scoring**: Attention score calculated from weighted factors
5. **Alerts**: Violations trigger visual alerts and database logging

### Detection Types

| Violation Type | Description | Trigger Condition |
|---------------|-------------|-------------------|
| `eyes_away` | Eyes looking away from screen | Gaze away > 3 seconds |
| `head_turned` | Head rotated significantly | Head turn > 30° for > 2 seconds |
| `multiple_faces` | Multiple people detected | > 1 face for > 2 seconds |
| `low_attention` | Overall low attention | Attention score < 50 |

### Attention Score Calculation

```
Attention Score = (Gaze Focus × 0.4) + (Head Position × 0.3) + 
                  (Face Presence × 0.2) + (Movement Stability × 0.1)
```

**Score Ranges**:
- 80-100: Good attention (green indicator)
- 50-79: Moderate attention (yellow indicator)
- 0-49: Low attention (red indicator + alert)

## Configuration

Add to your `.env` file:

```bash
# Enable/disable cheating detection
VITE_ENABLE_CHEATING_DETECTION=true

# Sensitivity: low, medium, high
VITE_DETECTION_SENSITIVITY=medium

# Time before "eyes away" alert (milliseconds)
VITE_GAZE_AWAY_THRESHOLD=3000

# Head turn angle threshold (degrees)
VITE_HEAD_TURN_ANGLE_THRESHOLD=30

# Attention score threshold (0-100)
VITE_ATTENTION_SCORE_THRESHOLD=50
```

## Database Schema

### `cheating_detections` Table

```sql
CREATE TABLE cheating_detections (
  id UUID PRIMARY KEY,
  interview_id UUID REFERENCES interview_configurations(id),
  room_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  violation_type TEXT NOT NULL,  -- 'eyes_away', 'multiple_faces', etc.
  severity TEXT NOT NULL,        -- 'low', 'medium', 'high'
  confidence FLOAT NOT NULL,     -- 0.0 to 1.0
  metadata JSONB,                -- Additional detection data
  created_at TIMESTAMPTZ NOT NULL
);
```

## API

### Edge Function: `save-cheating-detection`

**Endpoint**: `POST /functions/v1/save-cheating-detection`

**Request Body**:
```json
{
  "roomId": "abc-def-ghi",
  "violationType": "eyes_away",
  "severity": "medium",
  "confidence": 0.85,
  "metadata": {
    "attentionScore": 45,
    "timestamp": 1234567890
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": { ... },
  "message": "Detection event saved successfully"
}
```

## Usage

### In Interview Room

The detector automatically activates for non-local participants (candidates) when:
1. Webcam is enabled
2. `VITE_ENABLE_CHEATING_DETECTION=true`
3. Participant joins the interview

### Visual Indicators

- **Attention Score Badge**: Circular indicator showing current score (0-100)
- **Status Text**: "Monitoring" or current violation
- **Alert Banner**: Red banner appears when violations detected

### Reviewing Detections

HR can review detection events in the candidate detail page:
- View violation timeline
- See attention score trends
- Export detection reports
- Review severity summaries

## Technical Details

### Dependencies

```json
{
  "@mediapipe/face_mesh": "^0.4.1633559619",
  "@mediapipe/camera_utils": "^0.3.1620248257"
}
```

### Browser Compatibility

- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+ (limited support)

**Requirements**:
- WebGL support
- Webcam access
- Modern JavaScript (ES2020+)

### Performance

- **CPU Usage**: ~20-30% on modern devices
- **Frame Rate**: 10-15 FPS for detection
- **Memory**: ~50-100 MB additional
- **Network**: Minimal (only event logging)

## Privacy & Ethics

### Privacy Considerations

1. **No Video Storage**: Video is processed in real-time; never stored
2. **Event-Only Logging**: Only detection events (timestamps, types) are saved
3. **Transparent**: Candidates should be informed about monitoring
4. **Configurable**: Can be disabled per interview or globally

### Ethical Guidelines

- **Inform Candidates**: Always disclose monitoring before interview
- **Fair Thresholds**: Adjust sensitivity to avoid false positives
- **Context Matters**: Consider legitimate reasons for looking away
- **Human Review**: Use as a tool, not sole decision factor

### False Positives

Common scenarios that may trigger false alerts:
- Reading notes (legitimate)
- Thinking/reflecting (eyes up)
- Poor lighting conditions
- Wearing glasses (glare)
- Accessibility needs

**Recommendation**: Review detection context before making judgments.

## Troubleshooting

### Detection Not Working

1. Check `.env` configuration
2. Verify webcam permissions
3. Check browser console for errors
4. Ensure MediaPipe CDN is accessible

### High False Positive Rate

1. Adjust `VITE_DETECTION_SENSITIVITY` to `low`
2. Increase `VITE_GAZE_AWAY_THRESHOLD` (e.g., 5000ms)
3. Increase `VITE_HEAD_TURN_ANGLE_THRESHOLD` (e.g., 45°)
4. Lower `VITE_ATTENTION_SCORE_THRESHOLD` (e.g., 30)

### Performance Issues

1. Reduce video resolution
2. Close other browser tabs
3. Check CPU usage
4. Disable on older devices

## Future Enhancements

- [ ] Machine learning-based anomaly detection
- [ ] Screen sharing monitoring
- [ ] Audio analysis for background voices
- [ ] Mobile device detection
- [ ] Advanced reporting dashboard
- [ ] Real-time HR notifications

## License

Part of the HR Management System. See main project LICENSE.
