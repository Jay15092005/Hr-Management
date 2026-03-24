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

function getDateDisplay() {
  const d = new Date()
  const day = d.getDate()
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayName = days[d.getDay()]
  const start = new Date(d.getFullYear(), 0, 1)
  const diff = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const weekNum = Math.ceil((diff + start.getDay() + 1) / 7)
  return `${day} ${dayName} Day ${diff + 1}/365 Week ${weekNum}/52`
}

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
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar glass">
        <div className="sidebar-logo">
          <div className="logo-icon">HR</div>
          <span className="logo-text">TalentStream</span>
        </div>
        
        <div className="sidebar-user">
          <div className="user-avatar">{user?.email?.[0].toUpperCase() ?? 'H'}</div>
          <div className="user-info">
            <span className="user-name">{user?.email?.split('@')[0] ?? 'HR Manager'}</span>
            <span className="user-email">{user?.email ?? 'hr@company.com'}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-btn ${activeSection === 'workflow' ? 'active' : ''}`}
            onClick={() => setActiveSection('workflow')}
          >
            <span className="nav-icon">⚡</span>
            Recruitment Workflow
          </button>
          <button
            className={`sidebar-btn ${activeSection === 'list' ? 'active' : ''}`}
            onClick={() => setActiveSection('list')}
          >
            <span className="nav-icon">📄</span>
            Resume Repository
          </button>
          <button
            className={`sidebar-btn ${activeSection === 'description' ? 'active' : ''}`}
            onClick={() => setActiveSection('description')}
          >
            <span className="nav-icon">📝</span>
            Job Descriptions
          </button>
          <button
            className={`sidebar-btn ${activeSection === 'meetings' ? 'active' : ''}`}
            onClick={() => setActiveSection('meetings')}
          >
            <span className="nav-icon">📅</span>
            Interviews & AI
          </button>
          <button
            className={`sidebar-btn ${activeSection === 'forms' ? 'active' : ''}`}
            onClick={() => setActiveSection('forms')}
          >
            <span className="nav-icon">🔗</span>
            Application Links
          </button>
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="logout-btn" onClick={handleSignOut}>
            
            Sign out
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-top-bar glass">
          <div className="header-breadcrumbs">
            <span className="breadcrumb-path">Dashboard</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">
              {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
            </span>
          </div>
          <div className="header-date">{getDateDisplay()}</div>
        </header>

        <div className="dashboard-content-wrapper">
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
      </main>
    </div>
  )
}
