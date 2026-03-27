## HR AI Interview Platform — Project Summary, Flow, and Pitch Deck

This document contains:
- **Whole project summary** (what it is, what problems it solves)
- **End-to-end flow** (HR → candidate → interview → evidence → reporting)
- **Implemented feature list** (based on this repo’s code)
- **Pitch deck content** in the same slide format you requested

---

## Whole Summary (Project Overview)

**HR AI Interview Platform** is an end-to-end hiring workflow system that helps HR teams collect resumes through **custom public links**, evaluate candidates using **AI resume scoring**, run **instant or scheduled interviews** in a **video meeting room**, capture **transcripts**, log **cheating/integrity signals**, and present everything in a **single pipeline view** for faster, more consistent hiring decisions.

Instead of using disconnected tools (forms + email + spreadsheets + video calls + manual notes), this platform unifies the entire pipeline:
- Candidate intake through controlled links
- Secure resume storage and retrieval
- AI-assisted evaluation (score + skill match + summary)
- Candidate selection (selected/rejected) tracking
- Interview creation (instant/scheduled), room management, and join links via email
- Optional recording and transcription, with transcript import and export
- Cheating detection and evidence logging
- HR dashboard views for pipeline and per-candidate detail reports

---

## What Problems It Solves

- **Resume overload**: HR can collect resumes at scale via a link and evaluate faster using AI scoring.
- **Inconsistent screening**: A standardized scoring output (0–100) with matched/missing skills improves consistency.
- **Scheduling effort**: Scheduled interviews are tracked and join links are emailed automatically.
- **Low visibility**: Transcripts and integrity signals are stored and viewable later, creating an audit trail.
- **Manual reporting**: The pipeline view consolidates everything (score, interview status, transcript, detections).

---

## End-to-End Flow (How the System Works)

### 1) HR Setup
- HR logs in using **email OTP**.
- HR creates **Job Descriptions** (title, description, required skills, min experience, location, degree).
- HR creates **Application Form Links** (slug, expiry date, enable/disable, optional requirements/details).

### 2) Candidate Resume Intake (Public Link)
- Candidate opens a link like: `/apply/{slug}`.
- Candidate fills details and uploads resume (PDF/DOC/DOCX/TXT).
- Backend validates:
  - Link exists and is active (and not expired)
  - File size and file type
- Resume file is stored in **private storage** and can be accessed via **signed URLs**.
- Candidate submission is recorded and becomes visible in HR workflow.

### 3) HR Shortlisting + AI Resume Scoring
- HR filters resumes (experience/location/degree/date filters).
- HR selects a job description and runs **AI Resume Evaluation**:
  - Extract resume text if possible
  - Call Gemini to return:
    - score (0–100)
    - missing skills
    - must-have matched skills
    - nice-to-have matched skills
    - one-line summary
- Scores are stored in database for review and later reporting.

### 4) HR Review → Select/Reject Candidate
- HR reviews candidates sorted by score.
- HR marks candidates as **Selected** or **Rejected** (with timestamps).
- For selected candidates:
  - HR can start an **Instant Interview** OR **Schedule an Interview**.

### 5) Interview Creation (Instant or Scheduled)

**Instant Interview**
- HR triggers creation of an interview immediately.
- A meeting room is created and the join link can be sent/opened.

**Scheduled Interview**
- HR schedules date/time, interview type, difficulty level, duration, and optional coding round.
- The system stores the interview configuration.
- The system emails the candidate with details and later sends the join link (configured automation).

### 6) Join Interview Room (VideoSDK)
- Candidate joins via: `/interview/{roomId}`.
- System validates room context before joining.
- Candidate and HR (or AI agent) join the same room.

### 7) AI Interview (Voice Agent)
- A Python AI agent can auto-detect active/scheduled interviews and join rooms.
- The agent conducts a structured technical interview based on:
  - interview type (Python/Node/React/Java/Other)
  - difficulty (Easy/Medium/Hard)
  - duration
  - job context (optional)
- Interview status is updated (scheduled → active → completed).

### 8) Cheating Detection (Integrity Signals)
During the interview, cheating detection can log events like:
- Eyes away / head turned
- Multiple faces
- Tab switch / fullscreen exit
- Mouse leave
- Copy/paste
- Mobile phone detection (vision)
Events are saved to the database with severity and confidence.

### 9) Transcript + Recording + Post-Meeting Import
Two transcript paths are supported:
- **Realtime transcript saving** (optional): lines are stored during the meeting.
- **Post-meeting transcript import**: transcript is imported from the video provider after processing.

Transcripts can be viewed in the UI and copied/exported as plain text.

### 10) Reporting / Evidence View (Pipeline)
HR can open a candidate pipeline detail page showing:
- Resume + candidate profile
- AI score + matched/missing skills
- Selection status + email timestamps
- Interview details (type, difficulty, duration, room id, status)
- Transcript
- Cheating detection event list and counts

---

## Implemented Features (Extracted from This Repo)

### Candidate Intake & Resume Management
- **Public application links** with slug + expiry + enable/disable
- **Public application form** for candidate details + resume upload
- **Resume storage** in private bucket + **signed URLs** for viewing
- **Resume list and filtering** (date range, experience, location, degree)

### Job Description + AI Scoring
- Job description management
- AI resume evaluation using **Google Gemini**
- Score output stored with summary and matched/missing skills
- Resume text extraction with fallback to basic candidate info

### Selection Pipeline
- Candidate selection statuses: pending/selected/rejected
- HR review UI with select/reject/reset
- Pipeline overview + pipeline detail view per candidate

### Interviews (Instant + Scheduled)
- Interview configuration: type, difficulty, duration, coding round, scheduled time
- Video room creation/activation flow
- Join link generation and email sending
- Interview status tracking (scheduled/active/completed/cancelled)

### Video, Transcription, and Evidence
- Video meeting room UI (VideoSDK)
- Optional recording toggle
- Realtime transcript line saving (optional)
- Post-meeting transcript import (VTT parsing) into DB
- Webhook capture table for transcription events
- Transcript viewing and copy/export

### Cheating Detection
- FaceMesh-based gaze/head pose detection
- Browser behavior detection (tab switch, fullscreen exit, copy/paste, mouse leave)
- Mobile phone detection using COCO-SSD
- All events saved with severity and confidence

### Security / Data Isolation
- HR authentication via OTP
- Per-HR tenancy with RLS (owner_id on resumes/job descriptions etc.)
- Candidate-facing minimal RPC access patterns (join context / complete interview)

---

## Pitch Deck Content (Same Format)

### Slide 1 — Title
**Application for PoC/Prototype Development through SSIP 2.0 in Phase 7**  
**HR AI Interview Platform**

**Group Leader System**  
**Jay Chotaliya (AI & ML 6th Sem)**

**Team Member**  
Khushi Mandora (CE 6th Sem)  
Abbas Ibrahim (EC 6th Sem)  
Jaymit Patel (EC 6th Sem)  
Paridhi Karmakar (EC 8th Sem)  
Tanay Chaturvedi (EC 8th Sem)

**Faculty Guide**  
Dr. Chirag Thakkar (HOD Of Computer)  
Ms. Bhoomi Trivedi (Computer Department)

---

### Slide 2 — Problem Statement
**“Most hiring workflows are fragmented: resume collection is manual, screening is inconsistent, interviews are hard to schedule, and outcomes are not standardized.”**

**However:**  
- HR spends heavy time on resume intake + shortlisting  
- Screening differs across reviewers (no consistent rubric)  
- Interview scheduling + links + reminders are operationally painful  
- Limited visibility: no unified transcript, cheating signals, or audit trail  
- Final decision reports are not generated end-to-end from evidence  

**“Therefore, there is a need for an AI-assisted interview platform that can collect resumes through controlled links, score candidates against job descriptions, conduct AI interviews, detect integrity issues, and generate structured reports with transcripts and pipeline tracking.”**

---

### Slide 3 — Solution
**“HR AI Interview Platform”**  
We propose an **end-to-end HR interview automation system** that supports **public resume intake via custom links**, **AI resume scoring**, **candidate selection pipeline**, **AI interview rooms**, **video recording + transcription**, **cheating detection**, and **automatic pipeline reporting** for HR decisions.

**Collect** — Custom application link → resume submission  
**Score** — AI JD-vs-resume evaluation (0–100 + skills)  
**Interview** — Instant/Scheduled interview room + AI interviewer agent  
**Report** — Transcript + integrity events + pipeline summary view

---

### Slide 4 — Technical Approach
**End-to-End Hiring Pipeline Integration**  
- HR creates **Job Descriptions** and shareable **Application Links** (expiry + enable/disable)  
- Candidates submit resume through **public form** (no HR login)  
- Resumes stored privately; HR views via **signed URLs**  
- AI scoring uses **Gemini** + resume text extraction (PDF/DOCX/TXT)  
- Candidate selection status (selected/rejected) + interview scheduling  
- Video meeting room via **VideoSDK** + secure token generation  
- Transcription: **realtime save** (optional) + **post-meeting import**  
- Cheating detection logs saved to DB for HR review  

---

### Slide 5 — Uniqueness
**Single Platform, End-to-End Evidence**  
**AI Screening + AI Interview + Integrity + Reporting**

---

### Slide 6 — Key Feature Blocks (4-box slide)
**Custom Resume Intake Links**  
HR generates a unique `/apply/{slug}` link with expiry, requirements, and job context; candidates upload resumes without HR login.

**AI Resume Scoring & Skill Matching**  
Gemini scores resumes (0–100), returns missing skills + matched must-have/nice-to-have skills, and stores results for HR review.

**AI Interview + Scheduling Automation**  
Instant interview creation or scheduled interviews with email flows, join links, and automated room activation.

**Integrity + Transcript Evidence**  
Cheating detection (gaze/head/tab/fullscreen/copy-paste/multiple faces/mobile phone) + meeting transcripts (realtime lines or VideoSDK import) for explainable reporting.

---

### Slide 7 — Applications
**Campus Placements / Mass Hiring**  
Handle large intake with standardized scoring and automated interviews.

**SMEs & Startups**  
Reduce hiring cycle time with end-to-end automation.

**Recruitment Agencies**  
Run multiple pipelines with consistent reporting per role/client.

**Remote Hiring**  
Video interview, recording/transcription, and integrity signals for remote reliability.

**Technical Screening at Scale**  
Role-based interview types (Python/Node/React/Java/Other) with difficulty settings.

---

### Slide 8 — Market Potential
**“Hiring is shifting to remote and high-volume pipelines, increasing demand for automated screening, standardized interviews, and auditable reports.”**

**“Organizations want faster hiring with consistent evaluation, lower operational overhead, and integrity signals to trust remote assessments.”**

---

### Slide 9 — Target Customers & Advantages
**Customer Segment**  
- HR teams (startups/SMEs/enterprises)  
- Recruitment agencies  
- Colleges / training institutes (placement drives)  
- Companies with frequent technical hiring  

**Our Advantages**  
- Custom candidate intake links (expiry + controlled access)  
- Faster shortlisting with AI scoring + matched skills breakdown  
- Instant + scheduled interview automation (emails + join link flow)  
- Video room + optional recording + transcription integration  
- Cheating detection with stored violation evidence  
- Unified pipeline views + exportable transcript text for reports  

---

### Slide 10 — Competition (table)
| Feature | ATS (Typical) | Interview Tools Only | Our HR AI Interview Platform |
|---|---|---|---|
| Resume Intake Link | Sometimes | No | Yes (custom slug, expiry, HR-owned) |
| AI Resume Scoring | Limited | No | Yes (Gemini scoring + skill matching) |
| Interview Scheduling + Email Automation | Partial | Partial | Yes (selection + join-link automation) |
| AI Interview Agent | No | Limited | Yes (Python agent auto-joins rooms) |
| Transcription + Import | Rare | Paid add-on | Yes (realtime save + VideoSDK import) |
| Cheating/Integrity Signals | Rare | Partial | Yes (gaze/head/tab/fullscreen/copy/mobile/…) |
| End-to-End Report View | Limited | No | Yes (pipeline detail: score + transcript + detections) |

---

### Slide 11 — Business Model & Revenue Streams
**SaaS Subscription**  
Per recruiter / per organization plans with feature tiers (scoring + interview + transcripts + integrity).

**Pay-per-Interview Credits**  
Usage-based pricing for high-volume drives.

**Enterprise Customization**  
Custom workflows, integrations, private deployments.

**Support & Maintenance**  
Ongoing upgrades, monitoring, and priority support.

---

### Slide 12 — Funding Sought (components table template)
Use the same “Sr No. / Components Required / Specifications / Qty / Unit cost / Total / Link” layout:

1. **Cloud & Database** — Supabase hosting, storage for resume files, logs — Qty 1 — ₹XX  
2. **AI Processing** — Gemini API usage (resume scoring + interview intelligence) — Qty 1 — ₹XX  
3. **Video Infra** — VideoSDK meetings, recording, transcription processing — Qty 1 — ₹XX  
4. **Email Delivery** — Resend + domain verification + deliverability — Qty 1 — ₹XX  
5. **Compute for AI Agent** — run voice agent + monitoring (VM/containers) — Qty 1 — ₹XX  
6. **Security & Compliance** — backups, audit logging, access controls — Qty 1 — ₹XX  
7. **Contingency** — pilot testing + unexpected costs — Qty 1 — ₹XX  

**Total: ₹XX**

---

### Slide 13 — Road Ahead
**01 — Complete Working Prototype**  
Public application links, resume upload, job descriptions, AI scoring, HR review dashboard.

**02 — AI Interview Rollout**  
Instant + scheduled interview rooms, AI interviewer agent auto-join, improved interview rubrics.

**03 — Recording + Transcription**  
Enable recording safely, realtime transcript capture, post-meeting transcript import, exportable summaries.

**04 — Integrity & Analytics**  
Tune cheating detection thresholds, dashboards for violations, reliability metrics.

**05 — Deployment Readiness**  
Security hardening (RLS), scalability testing, onboarding docs, pilot with real HR teams.

---

### Slide 14 — Team
**Jay Chotaliya** — AI&ML 3rd Year — LDCE  
**Khushi Mandora** — CE 3rd Year — LDCE  
**Jaymit Patel** — EC 3rd Year — LDCE  
**Abbas Ibrahim** — EC 3rd Year — LDCE  
**Paridhi Karmakar** — EC 4th Year — LDCE  
**Tanay Chaturvedi** — EC 4th Year — LDCE  

