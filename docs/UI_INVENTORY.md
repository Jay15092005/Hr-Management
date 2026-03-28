# HR Management — UI inventory (current app)

Use this document as context when redesigning screens. It lists **routes**, **layout**, **primary components**, and **notable UI behaviors** as of the repo state. Styling is mostly per-component CSS files alongside the TSX (e.g. `Dashboard.css`).

**Brand:** `VITE_APP_BRAND_NAME` in `.env` overrides the dashboard title (default: “AI Interview System”).

---

## Route map (`src/main.tsx`)

| Path | Auth | Screen / component |
|------|------|-------------------|
| `/login/*` | Public | Clerk **Sign in** (`LoginPage`) |
| `/signup/*` | Public | Clerk **Sign up** (`SignupPage`) |
| `/confirm-interview` | Public | Candidate confirms a proposed slot (`ConfirmInterview`) |
| `/schedule-interview` | Public | Candidate picks a slot (`ScheduleInterview`) |
| `/interview/:roomId` | Public | Candidate **joins VideoSDK room** (`JoinInterview` → `InterviewRoom`) |
| `/apply/:slug` | Public | **Public job application** form (`PublicApplicationForm`) |
| `/` | **RequireAuth** (Clerk + HR profile sync) | **Dashboard** (`Dashboard`) — main HR shell |
| `/candidate/:jobId/:resumeId` | RequireAuth | **Candidate detail** (`CandidateDetail`) |
| `/pipeline/:selectionId` | RequireAuth | **Pipeline detail** (`PipelineDetail`) |
| `/transcripts/:roomId` | RequireAuth | **Meeting transcript + recordings** (`MeetingTranscripts`) |

**Shell:** Authenticated routes render `App` (outlet only + shared React context for job/resume workflow) then nested routes. `App.tsx` has **no chrome**; the **dashboard header/nav** lives inside `Dashboard.tsx`.

---

## 1. Authentication (`components/auth/`)

### Login (`/login/*`) — `LoginPage.tsx` + `ClerkAuth.css`
- Centered **Clerk `<SignIn />`** (`path="/login"`, `signUpUrl="/signup"`).
- States: “Connecting…” while Clerk loads or profile sync runs.
- Red **alert** if Supabase HR profile sync fails (`syncError`), with Dismiss.

### Sign up (`/signup/*`) — `SignupPage.tsx` + `ClerkAuth.css`
- Clerk **sign-up** flow (mirror pattern to login).

---

## 2. HR dashboard (`/`)

### `Dashboard.tsx` + `Dashboard.css`
**Header bar**
- Left: **brand** (`APP_BRAND_NAME`).
- User **email** + **Sign out** (returns to `/login`).

**Primary nav** (horizontal buttons with emoji icons — currently mostly 📄)
- **Resume list** → `ResumeList`
- **Description** → `JobDescriptionManager` (full job CRUD / picker)
- **Workflow** → `HRWorkflow`
- **Meeting Details** → `MeetingOverview`
- **Form Links** → `ApplicationLinksManager`

**Content area:** one section visible at a time (`dashboard-section`).

**Note:** `Dashboard` defines a section type `'upload'` and can render `UploadResume`, but there is **no nav button** for Upload in the current header; upload is not exposed in the default tabs.

---

## 3. Dashboard sections (components)

### Resume list — `ResumeList.tsx` + CSS
- Table/list of resumes, filters/actions tied to storage and scoring entry points.

### Job descriptions — `JobDescription.tsx` + CSS
- Create/edit/list **job descriptions**; used standalone and **embedded inside HR Workflow** (compact mode).

### HR Workflow — `HRWorkflow.tsx` + `HRWorkflow.css`
Stacked blocks:
1. **HR filters** — `HRFilters` (compact)
2. **Job description** — `JobDescriptionManager` (compact) + apply-all-resumes
3. **Candidates table** — `CandidatesTable` (after a job is selected)

Hint when resumes filtered but no job selected.

### Meeting Details — `MeetingOverview.tsx` + `MeetingOverview.css`
- Pipeline-style **table**: candidate, job, score, selection status, interview status, room id, link sent, etc.
- **Sort** (name, job, score, status, scheduled time) and **filters** (all / selected / scheduled / link-sent / completed).
- **Search** string filter.
- Row actions navigate to **candidate detail**, **pipeline detail**, **transcripts** (by `roomId`), etc.

### Form links — `ApplicationLinksManager.tsx` + CSS
- Manage **public application links** (slug, expiry, job binding).

### Upload (optional section) — `UploadResume.tsx`
- Not in main nav; available if `activeSection === 'upload'`.

---

## 4. Candidate detail (`/candidate/:jobId/:resumeId`)

### `CandidateDetail.tsx` + `CandidateDetail.css`
Typical blocks (data-dependent):
- Back navigation, resume **metadata**, **resume file** link (`ResumeFileLink`).
- **AI score** summary, skills match / missing skills.
- **Selection** actions (select/reject), **send selection email**.
- **Interview**: schedule modal (`InterviewScheduler`), **instant interview** modal (type, difficulty, duration, coding round).
- **Cheating detections** list when an interview exists.
- Links out to pipeline / meetings as implemented in the file.

---

## 5. Pipeline detail (`/pipeline/:selectionId`)

### `PipelineDetail.tsx` + CSS
- Deep view for a **candidate selection** in the pipeline (status, emails, interview steps).
- Can overlap conceptually with candidate detail but keyed by `selectionId`.

---

## 6. Meeting transcripts & recordings (`/transcripts/:roomId`)

### `MeetingTranscripts.tsx` + `MeetingTranscripts.css`
- **Back** to dashboard meetings section (`state.section: 'meetings'`).
- **Header card:** title “Meeting Transcript”, **Room ID**, optional date from first line.
- **Actions:** Refresh (reload DB lines), Copy as Text, **Import from VideoSDK** (edge function → DB lines).
- **Cloud recordings** section: **Load recordings** (edge function → VideoSDK list), per-recording **video player**, open in new tab, **Refresh from VideoSDK** (single recording API).
- **Transcript table:** #, Time, Speaker, Message (from `meeting_transcripts`).
- Errors: separate messaging for transcript vs recordings where applicable; parses edge function JSON errors for human-readable text.

---

## 7. Candidate interview join (`/interview/:roomId`)

### `JoinInterview.tsx` + `JoinInterview.css`
- Loads **candidate name** via Supabase RPC `interview_join_context`.
- Loading / error / “Go to Home”.
- Renders **`InterviewRoom`**.

### `InterviewRoom.tsx` + `InterviewRoom.css`
- Fetches **VideoSDK token** via edge function `generate-videosdk-token`.
- States: token loading/error; **room validation** (RPC); **pre-join** screen (“Join Interview”); **joining** spinner; **in meeting**.
- **In meeting:** header (title + room id), **Controls** (mic, camera, leave), **participant grid** with `VideoPlayer`.
- **CheatingDetector** overlays on **local** participant when enabled (env test mode or local tile).
- Optional **realtime transcription** and **recording** hooks (env flags).

---

## 8. Public / candidate flows (no HR shell)

### Confirm interview — `ConfirmInterview.tsx` + CSS
- Token/query-driven **slot confirmation** UI.

### Schedule interview — `ScheduleInterview.tsx` + CSS
- Candidate **scheduling** UI (slot selection).

### Public application — `PublicApplicationForm.tsx` + CSS
- **`/apply/:slug`**: job-specific **application form** (resume upload, fields per link config).

---

## 9. Modals & shared UI patterns

- **Instant interview** modals appear in `CandidateDetail`, `CandidatesTable`, `HRReview`, `PipelineDetail` (similar form: type, difficulty, duration, coding round).
- **Tables** with sort/filter recur in `MeetingOverview`, `CandidatesTable`, `ResumeList`, etc.
- **Toast-style** errors: pink/red banners (`mt-error`, dashboard errors, etc.).

---

## 10. Styling & assets

- Global app wrapper: `App.css` (minimal).
- Entry: `main.tsx`, `index.css`.
- Each major feature typically has a **co-located** `*.css` file matching the component name.
- No unified design-system file in repo; **colors/spacing vary** by screen (dashboard grays, transcript page `#f8f9fa`, buttons mixed solid/outline).

---

## 11. Auth guard

- `RequireAuth` wraps `/` and child routes: ensures Clerk session + HR profile sync before dashboard.

---

## Quick file index (primary pages)

| Route / area | Main component file |
|--------------|---------------------|
| Dashboard shell | `src/components/Dashboard.tsx` |
| Workflow | `src/components/HRWorkflow.tsx` |
| Meetings table | `src/components/MeetingOverview.tsx` |
| Candidate | `src/components/CandidateDetail.tsx` |
| Pipeline | `src/components/PipelineDetail.tsx` |
| Transcripts | `src/components/MeetingTranscripts.tsx` |
| Interview room | `src/components/JoinInterview.tsx`, `InterviewRoom.tsx` |
| Public apply | `src/components/PublicApplicationForm.tsx` |
| Login / signup | `src/components/auth/LoginPage.tsx`, `SignupPage.tsx` |

---

*Generated for UI redesign handoff. Update this file when routes or major sections change.*
