import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import Dashboard from './components/Dashboard'
import JoinInterview from './components/JoinInterview'
import CandidateDetail from './components/CandidateDetail'
import ConfirmInterview from './components/ConfirmInterview'
import ScheduleInterview from './components/ScheduleInterview'
import PipelineDetail from './components/PipelineDetail'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="candidate/:jobId/:resumeId" element={<CandidateDetail />} />
          <Route path="pipeline/:selectionId" element={<PipelineDetail />} />
        </Route>
        <Route path="/confirm-interview" element={<ConfirmInterview />} />
        <Route path="/schedule-interview" element={<ScheduleInterview />} />
        <Route path="/interview/:roomId" element={<JoinInterview />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
