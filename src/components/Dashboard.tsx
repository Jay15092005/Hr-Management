import { useState, useEffect } from 'react'
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { WorkflowContext } from '../App'
import UploadResume from './UploadResume'
import ResumeList from './ResumeList'
import HRWorkflow from './HRWorkflow'
import JobDescriptionManager from './JobDescription'
import MeetingOverview from './MeetingOverview'
import ApplicationLinksManager from './ApplicationLinksManager'
import './Dashboard.css'

type Section = 'upload' | 'list' | 'description' | 'workflow' | 'meetings' | 'forms'

const APP_BRAND_NAME =
  import.meta.env.VITE_APP_BRAND_NAME?.trim() || 'AI Interview System'

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<Section>('workflow')
  const [refreshKey, setRefreshKey] = useState(0)
  const workflowContext = useOutletContext<WorkflowContext>()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    const s = location.state?.section
    if (s === 'workflow' || s === 'meetings') {
      setActiveSection(s)
    }
  }, [location.state?.section])

  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div className="header-brand">{APP_BRAND_NAME}</div>
          <div className="dashboard-user-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#555' }} title={user?.email ?? ''}>
              {user?.email ?? 'HR'}
            </span>
            <button type="button" className="nav-btn" onClick={handleSignOut} style={{ fontSize: '0.85rem' }}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="dashboard-nav">
          <button
            className={`nav-btn ${activeSection === 'list' ? 'active' : ''}`}
            onClick={() => setActiveSection('list')}
          >
            <span className="nav-icon">📄</span>
            Resume list
          </button>
          <button
            className={`nav-btn ${activeSection === 'description' ? 'active' : ''}`}
            onClick={() => setActiveSection('description')}
          >
            <span className="nav-icon">📄</span>
            Description
          </button>
          <button
            className={`nav-btn ${activeSection === 'workflow' ? 'active' : ''}`}
            onClick={() => setActiveSection('workflow')}
          >
            <span className="nav-icon">📄</span>
            Workflow
          </button>
          <button
            className={`nav-btn ${activeSection === 'meetings' ? 'active' : ''}`}
            onClick={() => setActiveSection('meetings')}
          >
            <span className="nav-icon">📋</span>
            Meeting Details
          </button>
          <button
            className={`nav-btn ${activeSection === 'forms' ? 'active' : ''}`}
            onClick={() => setActiveSection('forms')}
          >
            <span className="nav-icon">🔗</span>
            Form Links
          </button>
        </nav>
      </header>

      <div className="dashboard-content">
        {activeSection === 'upload' && (
          <div className="dashboard-section">
            <UploadResume onUploadSuccess={handleUploadSuccess} />
          </div>
        )}

        {activeSection === 'list' && (
          <div className="dashboard-section">
            <ResumeList refreshTrigger={refreshKey} />
          </div>
        )}

        {activeSection === 'description' && (
          <div className="dashboard-section">
            <JobDescriptionManager onJobDescriptionSelect={() => {}} />
          </div>
        )}

        {activeSection === 'workflow' && (
          <div className="dashboard-section">
            <HRWorkflow
              selectedJobDescription={workflowContext.selectedJobDescription}
              setSelectedJobDescription={workflowContext.setSelectedJobDescription}
              filteredResumes={workflowContext.filteredResumes}
              setFilteredResumes={workflowContext.setFilteredResumes}
            />
          </div>
        )}

        {activeSection === 'meetings' && (
          <div className="dashboard-section">
            <MeetingOverview />
          </div>
        )}

        {activeSection === 'forms' && (
          <div className="dashboard-section">
            <ApplicationLinksManager />
          </div>
        )}
      </div>
    </div>
  )
}
