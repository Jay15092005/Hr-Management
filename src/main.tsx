import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import Dashboard from './components/Dashboard'
import JoinInterview from './components/JoinInterview'
import CandidateDetail from './components/CandidateDetail'
import ConfirmInterview from './components/ConfirmInterview'
import ScheduleInterview from './components/ScheduleInterview'
import PipelineDetail from './components/PipelineDetail'
import MeetingTranscripts from './components/MeetingTranscripts'
import RequireAuth from './components/RequireAuth'
import LoginPage from './components/auth/LoginPage'
import SignupPage from './components/auth/SignupPage'
import PublicApplicationForm from './components/PublicApplicationForm'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/login"
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login/*" element={<LoginPage />} />
            <Route path="/signup/*" element={<SignupPage />} />
            <Route path="/confirm-interview" element={<ConfirmInterview />} />
            <Route path="/schedule-interview" element={<ScheduleInterview />} />
            <Route path="/interview/:roomId" element={<JoinInterview />} />
            <Route path="/apply/:slug" element={<PublicApplicationForm />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<App />}>
                <Route index element={<Dashboard />} />
                <Route path="candidate/:jobId/:resumeId" element={<CandidateDetail />} />
                <Route path="pipeline/:selectionId" element={<PipelineDetail />} />
                <Route path="transcripts/:roomId" element={<MeetingTranscripts />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ClerkProvider>
  </React.StrictMode>,
)
