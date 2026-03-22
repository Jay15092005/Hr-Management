# 🧪 CHEATING DETECTION - MANUAL TESTING GUIDE

## ✅ What I Just Fixed

### Problem 1: Not Showing Logs
**Root Cause**: The cheating detector was only enabled for **remote participants** (the candidate), not for **you** (the local participant).

**Solution**: Added **TEST MODE** that enables cheating detection on yourself!

### Changes Made:
1. ✅ Added `VITE_CHEATING_DETECTION_TEST_MODE=true` to `.env`
2. ✅ Modified `InterviewRoom.tsx` to support test mode
3. ✅ Added console logging to track initialization

---

## 🚀 HOW TO TEST NOW

### Step 1: Restart the Application
The app should auto-reload, but if not:
```bash
# Stop the current process (Ctrl+C in the terminal)
# Then restart:
./start.sh
```

### Step 2: Open Your Browser
1. Go to: **http://localhost:5173**
2. **Press F12** to open Developer Tools
3. Click on the **Console** tab

### Step 3: Join an Interview

#### Option A: Quick Test (Instant Interview)
1. Login as HR
2. Go to "Schedule Interview" or "Instant Interview"
3. Create an instant interview
4. **Join the interview**
5. **IMPORTANT: Turn ON your webcam** 📹

#### Option B: Full Test (With Candidate)
1. Create an interview as HR
2. Open a **second browser** (or incognito window)
3. Join as the candidate
4. Turn on webcam in both windows

### Step 4: Check Console Logs

You should see these logs appear:

```
[ParticipantView] Setting video element for cheating detection
[CheatingDetector] Initializing for room: abc-def-ghi
[CheatingDetector] Started monitoring
```

**If you see this instead:**
```
[CheatingDetector] Not initializing: { enabled: true, hasVideo: false, hasCanvas: true }
```
→ Wait 5-10 seconds. The video element needs time to initialize.

### Step 5: Test Detection

Once you see "Started monitoring", try these:

#### Test 1: Eyes Away (3+ seconds)
- **Look LEFT** for 3+ seconds
- **Expected**: 
  - Alert appears: "Looking left"
  - Attention score drops
  - Red badge appears

#### Test 2: Eyes Away (Different Directions)
- **Look RIGHT** for 3+ seconds
- **Look UP** for 3+ seconds
- **Look DOWN** for 3+ seconds
- **Expected**: Alerts for each direction

#### Test 3: Head Turn
- **Turn your head** significantly (>30°)
- Hold for 2+ seconds
- **Expected**:
  - Alert: "Head turned away"
  - Attention score drops

#### Test 4: Multiple Faces
- Have someone else appear in camera
- **Expected**:
  - Alert: "Multiple faces detected"
  - Attention score drops significantly

---

## 📊 What You Should See

### Visual Indicators

1. **Attention Score Badge** (top of your video)
   - 🟢 Green circle with number (80-100)
   - 🟡 Yellow circle (50-79)
   - 🔴 Red circle (0-49)

2. **Status Text**
   - "Monitoring" = Normal
   - "Looking left/right/up/down" = Eyes away
   - "Head turned away" = Head rotation
   - "Multiple faces detected" = Multiple people

3. **Alert Banner** (when violation occurs)
   - ⚠️ Red warning banner
   - Shows the specific violation

### Console Logs to Look For

```javascript
// Initialization
[ParticipantView] Setting video element for cheating detection
[CheatingDetector] Initializing for room: xyz-123
[CheatingDetector] Started monitoring

// When you look away
[CheatingDetector] Eyes away detected: left
[CheatingDetector] Saving detection event...

// When you turn head
[CheatingDetector] Head turned: 35 degrees
```

---

## 🐛 Troubleshooting

### Issue: No Logs at All

**Check 1**: Is the app running?
```bash
# In terminal, you should see:
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

**Check 2**: Is webcam ON?
- Look for the 📹 icon in the participant view
- Browser should ask for camera permission

**Check 3**: Check .env file
```bash
# These should be set:
VITE_ENABLE_CHEATING_DETECTION=true
VITE_CHEATING_DETECTION_TEST_MODE=true
```

**Check 4**: Hard refresh browser
- Press `Ctrl + Shift + R` (Windows)
- Or `Cmd + Shift + R` (Mac)

### Issue: "Not initializing: hasVideo: false"

**Cause**: Video element not ready yet

**Solution**: 
1. Wait 10 seconds
2. Make sure webcam is ON
3. Check browser console for video errors

### Issue: Logs Show "enabled: false"

**Cause**: Cheating detection is disabled

**Fix**:
1. Check `.env` file
2. Make sure: `VITE_ENABLE_CHEATING_DETECTION=true`
3. Restart the app

### Issue: No Visual Alerts (but logs work)

**Cause**: CSS might not be loaded

**Fix**:
1. Check if `CheatingDetector.css` exists
2. Hard refresh browser
3. Check browser console for CSS errors

---

## 📸 Screenshot Guide

Take screenshots of:
1. ✅ Console showing initialization logs
2. ✅ Attention score badge (green/yellow/red)
3. ✅ Alert banner when violation occurs
4. ✅ Browser DevTools showing the logs

---

## 🔍 Advanced Debugging

### Check if MediaPipe is Loading

In browser console, type:
```javascript
// Check if FaceMesh is available
console.log(window.FaceMesh)
```

### Check Video Element

In browser console, type:
```javascript
// Find the hidden video element
const videos = document.querySelectorAll('video')
console.log('Videos found:', videos.length)
videos.forEach((v, i) => {
  console.log(`Video ${i}:`, {
    srcObject: v.srcObject,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight
  })
})
```

### Check Environment Variables

In browser console, type:
```javascript
console.log('Cheating Detection Enabled:', import.meta.env.VITE_ENABLE_CHEATING_DETECTION)
console.log('Test Mode:', import.meta.env.VITE_CHEATING_DETECTION_TEST_MODE)
```

---

## ✨ Expected Behavior Summary

| Action | Time | Expected Result |
|--------|------|----------------|
| Join interview + webcam ON | Immediate | Logs: "Initializing...", "Started monitoring" |
| Look away | 3+ seconds | Alert: "Looking [direction]", Score drops |
| Turn head | 2+ seconds | Alert: "Head turned away", Score drops |
| Multiple faces | 2+ seconds | Alert: "Multiple faces", Score drops 40 points |
| Return to normal | Immediate | Alerts clear, Score recovers |

---

## 🎯 Success Criteria

You'll know it's working when:
- ✅ Console shows initialization logs
- ✅ Attention score badge appears
- ✅ Looking away triggers alerts
- ✅ Turning head triggers alerts
- ✅ Score changes based on behavior
- ✅ Events are saved to database (check Supabase)

---

## 📝 Notes

- **Test mode is ONLY for development**
- In production, set `VITE_CHEATING_DETECTION_TEST_MODE=false`
- This will only monitor remote candidates, not HR
- All detection events are logged to `cheating_detections` table in Supabase

---

## 🆘 Still Not Working?

If you've tried everything and it's still not working:

1. **Share the console logs** - Copy everything from the console
2. **Check the network tab** - Look for failed requests
3. **Verify Supabase connection** - Make sure API keys are correct
4. **Check MediaPipe CDN** - Make sure you can access: https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/

---

Good luck! 🚀
