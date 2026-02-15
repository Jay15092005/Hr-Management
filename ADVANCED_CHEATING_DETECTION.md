# 🛡️ ADVANCED CHEATING DETECTION - FEATURES & TESTING

## 🆕 New Features Added
We have upgraded the cheating detection system with comprehensive browser monitoring!

### 1. Tab Switching Detection
- **What it does**: Detects when the candidate switches tabs or minimizes the browser.
- **Alert**: "Tab switched"
- **Penalty**: -20 Attention Score

### 2. Copy/Paste Blocking
- **What it does**: Detects any copy (`Ctrl+C`) or paste (`Ctrl+V`) attempts.
- **Alert**: Logs "Copy detected" or "Paste detected"
- **Action**: Events are logged to the database.

### 3. Fullscreen Enforcement
- **What it does**: Monitors if the candidate exits fullscreen mode.
- **Alert**: Logs "fullscreen_exit" event.
- **Note**: You may need to prompt users to enter fullscreen first.

### 4. Mouse Tracking
- **What it does**: Detects when the mouse cursor leaves the exam window/document body.
- **Alert**: Logs "Mouse left window"

### 5. Audio Analysis
- **What it does**: Analyzes the microphone stream for suspicious volume levels (e.g., shouting, loud background noise).
- **Current Status**: Logs high volume to console for tuning. Can be enabled to trigger alerts.

---

## 🧪 HOW TO TEST NEW FEATURES

### Step 1: Eye Tracking (Improved)
- Look **Left/Right/Up/Down** markedly.
- Thresholds have been adjusted (0.30/0.70) to be more accurate.
- **Note**: If directions feel swapped, remember the camera might be mirrored!

### Step 2: Tab Switching
1. Open the interview page.
2. **Switch to another tab** (e.g., Google).
3. Switch back.
4. **Check Console**: You should see `[CheatingDetector] Violation: tab_switch`

### Step 3: Copy/Paste
1. Highlight any text on the page.
2. Press `Ctrl+C`.
3. **Check Console**: `[CheatingDetector] Copy detected`.

### Step 4: Fullscreen
1. Press `F11` (or make browser fullscreen).
2. Exit fullscreen (`Esc` or `F11`).
3. **Check Console**: `[CheatingDetector] Violation: fullscreen_exit`

---

## ❓ FAQ & Troubleshooting

### Q: "Eye movement not working proper"
**A:** We adjusted the sensitivity. You now need to look *more distinctly* away. Tiny movements won't trigger it (to avoid false alarms).

### Q: "Single user detection not showing"
**A:** Ensure `.env` has:
```
VITE_ENABLE_CHEATING_DETECTION=true
VITE_CHEATING_DETECTION_TEST_MODE=true
```
If you are the **only person** in the room, you MUST have `TEST_MODE=true` to see it on yourself.

### Q: "Stores in database?"
**A:** **YES!** All events are stored in the `cheating_detections` table in Supabase.
- Go to Supabase Dashboard > Table Editor > `cheating_detections`.
- You will see rows for `tab_switch`, `copy_paste`, `eyes_away`, etc.

### Q: "One AI and One Me" issue
**A:** When you have 2 participants (AI + You), the system sees a "remote" participant and automatically enables detection on them. The "Test Mode" forces it to strict checking on *everyone* including yourself.

---

## 🔧 Database Update
A new migration `20250215_update_violation_types.sql` was created to allow the new violation types in the database.
