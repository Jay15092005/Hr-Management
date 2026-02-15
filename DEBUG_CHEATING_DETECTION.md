# 🔧 CHEATING DETECTION - DEBUGGING GUIDE

## Current Issue: "enabled: false, hasCanvas: false, hasVideo: false"

### What I Just Fixed:

1. ✅ **Changed environment variable check** from `!== 'false'` to `=== 'true'`
2. ✅ **Added debug logging** to show config values
3. ✅ **Fixed canvas rendering** - now always rendered even when disabled
4. ✅ **Created EnvTest component** to verify environment variables

---

## 🚀 IMMEDIATE STEPS TO FIX

### Step 1: Verify Environment Variables are Loaded

Open your browser and navigate to: **http://localhost:5173**

Then open the browser console (F12) and type:

```javascript
console.log('VITE_ENABLE_CHEATING_DETECTION:', import.meta.env.VITE_ENABLE_CHEATING_DETECTION)
console.log('VITE_CHEATING_DETECTION_TEST_MODE:', import.meta.env.VITE_CHEATING_DETECTION_TEST_MODE)
```

**Expected Output:**
```
VITE_ENABLE_CHEATING_DETECTION: "true"
VITE_CHEATING_DETECTION_TEST_MODE: "true"
```

**If you see `undefined`:**
- The .env file isn't being loaded
- You need to restart the Vite dev server
- Run: `Ctrl+C` in terminal, then `./start.sh` again

---

### Step 2: Check the New Debug Logs

After joining an interview with webcam ON, you should now see:

```
[CheatingDetector] Config: {
  envEnabled: "true",
  propEnabled: true,
  finalEnabled: true,
  hasVideo: true
}
```

**If `envEnabled` is `undefined`:**
→ Environment variables not loaded. Restart the server.

**If `propEnabled` is `false`:**
→ The component is being passed `enabled={false}`. Check InterviewRoom.tsx

**If `hasVideo` is `false`:**
→ Video element not ready yet. Wait a few seconds.

---

### Step 3: Hard Refresh the Browser

Sometimes the browser caches the old code. Do a **hard refresh**:

- **Windows**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

---

## 🔍 Detailed Debugging Steps

### Debug 1: Check .env File

Run this in PowerShell:
```powershell
Get-Content .env | Select-String "VITE_ENABLE_CHEATING_DETECTION"
```

**Expected:**
```
VITE_ENABLE_CHEATING_DETECTION=true
```

**If it shows `false` or nothing:**
→ Edit `.env` and set it to `true`

---

### Debug 2: Check if Vite Loaded the .env

In browser console:
```javascript
// This will show ALL environment variables
console.log(import.meta.env)
```

Look for `VITE_ENABLE_CHEATING_DETECTION` in the output.

**If it's missing:**
1. Stop the server (`Ctrl+C`)
2. Delete `node_modules/.vite` cache:
   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   ```
3. Restart: `./start.sh`

---

### Debug 3: Check Component Props

In browser console, when on the interview page:
```javascript
// Find the CheatingDetector component in React DevTools
// Or add this to InterviewRoom.tsx temporarily:
console.log('[InterviewRoom] shouldEnableDetection:', shouldEnableDetection)
console.log('[InterviewRoom] videoElement:', videoElement)
```

---

### Debug 4: Check Video Element

In browser console:
```javascript
// Check if video elements exist
const videos = document.querySelectorAll('video')
console.log('Total videos:', videos.length)

videos.forEach((v, i) => {
  console.log(`Video ${i}:`, {
    display: v.style.display,
    srcObject: !!v.srcObject,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    paused: v.paused
  })
})
```

**Expected:**
- At least 2 video elements (one visible, one hidden for detection)
- Hidden video should have `srcObject: true` and `readyState: 4`

---

## 🎯 Common Issues & Solutions

### Issue 1: "envEnabled: undefined"

**Cause:** Environment variables not loaded by Vite

**Solutions:**
1. Restart the dev server completely
2. Check `.env` file exists in project root
3. Make sure variable starts with `VITE_`
4. Clear Vite cache and restart

---

### Issue 2: "propEnabled: false"

**Cause:** Component receiving `enabled={false}`

**Check:** In `InterviewRoom.tsx`, line ~145:
```typescript
<CheatingDetector
  videoElement={videoElement}
  roomId={roomId}
  enabled={shouldEnableDetection && !!videoElement}  // This should be true
/>
```

**Debug:** Add console.log before this line:
```typescript
console.log('[InterviewRoom] Rendering CheatingDetector:', {
  shouldEnableDetection,
  hasVideoElement: !!videoElement,
  enabled: shouldEnableDetection && !!videoElement
})
```

---

### Issue 3: "hasVideo: false"

**Cause:** Video element not ready when component renders

**Solutions:**
1. Wait 5-10 seconds after joining
2. Make sure webcam is ON (look for 📹 icon)
3. Check browser gave camera permission
4. Check the video stream is working (you should see yourself)

---

### Issue 4: "hasCanvas: false"

**Cause:** Canvas ref not attached (should be fixed now)

**Verify:** In browser console:
```javascript
document.querySelectorAll('canvas').length
```

Should return at least 1.

---

## 🧪 Testing Checklist

- [ ] Environment variables show in browser console
- [ ] `.env` file has `VITE_ENABLE_CHEATING_DETECTION=true`
- [ ] `.env` file has `VITE_CHEATING_DETECTION_TEST_MODE=true`
- [ ] Server restarted after changing `.env`
- [ ] Browser hard refreshed (`Ctrl+Shift+R`)
- [ ] Joined interview with webcam ON
- [ ] See `[CheatingDetector] Config:` log with `finalEnabled: true`
- [ ] See `[CheatingDetector] Initializing for room:` log
- [ ] See `[CheatingDetector] Started monitoring` log
- [ ] See attention score badge on screen

---

## 📝 What Should Happen (Timeline)

```
1. Page loads
   → [CheatingDetector] Config: { envEnabled: "true", ... }

2. Join interview
   → [InterviewRoom] Rendering CheatingDetector: { ... }

3. Webcam turns on
   → [ParticipantView] Setting video element for cheating detection

4. Component initializes
   → [CheatingDetector] Initializing for room: xyz-123

5. MediaPipe loads
   → [CheatingDetector] Started monitoring

6. You should see:
   - Green attention score badge (100)
   - Status: "Monitoring"
```

---

## 🆘 If Still Not Working

### Last Resort: Complete Reset

```powershell
# Stop the server
# Ctrl+C in terminal

# Clear all caches
Remove-Item -Recurse -Force node_modules\.vite
Remove-Item -Recurse -Force dist

# Verify .env file
Get-Content .env | Select-String "VITE_"

# Restart
./start.sh
```

Then:
1. Wait for "ready in xxx ms"
2. Open browser to http://localhost:5173
3. Hard refresh (`Ctrl+Shift+R`)
4. Open console (F12)
5. Check environment variables
6. Join interview with webcam ON
7. Look for logs

---

## 📸 Share These for Help

If still not working, share:
1. Screenshot of browser console showing all logs
2. Output of: `Get-Content .env | Select-String "VITE_"`
3. Output of browser console: `console.log(import.meta.env)`
4. Screenshot of the interview page

---

## ✅ Success Looks Like:

```
[CheatingDetector] Config: {
  envEnabled: "true",
  propEnabled: true,
  finalEnabled: true,
  hasVideo: true
}
[CheatingDetector] Initializing for room: abc-123
[CheatingDetector] Started monitoring
```

And you see a **green badge with "100"** on your video!

---

Good luck! 🚀
