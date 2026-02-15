# Cheating Detection Troubleshooting Guide

## Issues Fixed

### ✅ Issue 1: "Failed to decode frame: Bitstream not supported by this decoder"

**Problem**: This error was caused by VideoSDK's recording feature trying to use an incompatible video codec.

**Solution**: 
- Disabled video recording by default
- Added `VITE_ENABLE_RECORDING=false` to `.env`
- Recording is now optional and won't cause codec errors

**To enable recording** (if you need it):
```bash
VITE_ENABLE_RECORDING=true
```

---

### ✅ Issue 2: Cheating Detection Not Showing Alerts

**Problem**: The `CheatingDetector` component was receiving a `null` video element reference because the ref wasn't ready when the component first rendered.

**Solution**:
- Added state tracking (`videoElement`) to ensure the video element is ready before passing to detector
- Only enables detector when video element is available: `enabled={!isLocal && !!videoElement}`
- Added console logging to help debug initialization

---

## How to Test Cheating Detection

### 1. Start the Application
```bash
./start.sh
```

### 2. Open Browser Console
- Press `F12` to open Developer Tools
- Go to the **Console** tab

### 3. Join an Interview
- Create an interview as HR
- Join as a candidate (use a different browser or incognito mode)
- **Make sure your webcam is ON**

### 4. Look for Console Messages
You should see:
```
[CheatingDetector] Initializing for room: abc-def-ghi
[CheatingDetector] Started monitoring
```

If you see this instead:
```
[CheatingDetector] Not initializing: { enabled: true, hasVideo: false, hasCanvas: true }
```
This means the video element isn't ready yet. Wait a few seconds.

### 5. Test Detection by:

#### **Eyes Away Detection**
- Look away from the screen (left, right, up, or down)
- Hold for **3+ seconds**
- You should see:
  - 🔴 Red attention score badge
  - ⚠️ Alert: "Looking left" (or right/up/down)
  - Attention score drops

#### **Head Turn Detection**
- Turn your head significantly (>30 degrees)
- Hold for **2+ seconds**
- You should see:
  - ⚠️ Alert: "Head turned away"
  - Attention score drops

#### **Multiple Faces Detection**
- Have another person appear in the camera frame
- You should see:
  - ⚠️ Alert: "Multiple faces detected"
  - Attention score drops significantly

---

## Visual Indicators

### Attention Score Badge
- **🟢 Green (80-100)**: Good attention
- **🟡 Yellow (50-79)**: Moderate attention
- **🔴 Red (0-49)**: Low attention + alert triggered

### Status Text
- "Monitoring" = Everything normal
- "Looking left/right/up/down" = Eyes away detected
- "Head turned away" = Head rotation detected
- "Multiple faces detected" = More than one person
- "No face detected" = Camera can't see face

---

## Common Issues

### Issue: "Not initializing: hasVideo: false"
**Cause**: Video element not ready yet
**Solution**: Wait a few seconds after joining the meeting

### Issue: No alerts appearing
**Possible causes**:
1. Check `.env` has `VITE_ENABLE_CHEATING_DETECTION=true`
2. Make sure you're testing as a **non-local participant** (candidate, not HR)
3. Webcam must be ON
4. Check browser console for errors

### Issue: Too many false positives
**Solution**: Adjust sensitivity in `.env`:
```bash
VITE_DETECTION_SENSITIVITY=low
VITE_GAZE_AWAY_THRESHOLD=5000  # 5 seconds instead of 3
VITE_HEAD_TURN_ANGLE_THRESHOLD=45  # 45 degrees instead of 30
```

### Issue: MediaPipe not loading
**Cause**: CDN blocked or network issue
**Solution**: Check browser console for network errors. MediaPipe loads from:
```
https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/
```

---

## Database Verification

To verify detections are being saved:

1. Go to Supabase Dashboard
2. Navigate to **Table Editor** → `cheating_detections`
3. You should see rows with:
   - `room_id`: Your interview room ID
   - `violation_type`: eyes_away, head_turned, etc.
   - `severity`: low, medium, high
   - `confidence`: 0.0 to 1.0
   - `timestamp`: When it occurred

---

## Performance Tips

If detection is slow or laggy:
1. Close other browser tabs
2. Reduce video quality
3. Check CPU usage (should be ~20-30%)
4. Try Chrome/Edge (better WebGL support than Firefox/Safari)

---

## Next Steps

Once detection is working:
1. Test with different lighting conditions
2. Adjust thresholds based on your needs
3. Review detection logs in Supabase
4. Consider adding HR dashboard to view detections in real-time

---

## Need Help?

Check the browser console for detailed logs:
- `[CheatingDetector]` - Detector initialization and status
- `[Recording]` - Recording status (should be disabled)
- `[Transcription]` - Transcription status

All detection events are logged with timestamps and confidence scores!
