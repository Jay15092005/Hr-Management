import { useState, useEffect } from 'react'
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { useAuth } from '../contexts/AuthContext'
import type { WorkflowContext } from '../App'
import UploadResume from './UploadResume'
import ResumeList from './ResumeList'
import HRWorkflow from './HRWorkflow'
import JobDescriptionManager from './JobDescription'
import MeetingOverview from './MeetingOverview'
import ApplicationLinksManager from './ApplicationLinksManager'
import DashboardOverview from './DashboardOverview'
import './Dashboard.css'

type Section =
  | 'overview'
  | 'upload'
  | 'list'
  | 'description'
  | 'workflow'
  | 'meetings'
  | 'forms'
  | 'settings'

const APP_BRAND_NAME =
  import.meta.env.VITE_APP_BRAND_NAME?.trim() || 'AI Interview System'

const NAV_ITEMS: { id: Section; icon: string; label: string }[] = [
  { id: 'overview', icon: 'dashboard', label: 'Dashboard' },
  { id: 'list', icon: 'group', label: 'Candidates' },
  { id: 'description', icon: 'description', label: 'Job descriptions' },
  { id: 'workflow', icon: 'account_tree', label: 'Workflow' },
  { id: 'meetings', icon: 'videocam', label: 'Meetings' },
  { id: 'forms', icon: 'link', label: 'Application links' },
]

const SECTION_TITLE: Partial<Record<Section, string>> = {
  overview: 'Dashboard',
  upload: 'Upload resume',
  list: 'Candidates',
  description: 'Job descriptions',
  workflow: 'Workflow',
  meetings: 'Meeting details',
  forms: 'Application links',
  settings: 'Settings',
}

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const workflowContext = useOutletContext<WorkflowContext>()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { user: clerkUser } = useUser()
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

  const displayName =
    clerkUser?.fullName ||
    clerkUser?.primaryEmailAddress?.emailAddress ||
    user?.email ||
    'HR'
  const avatarUrl = clerkUser?.imageUrl

  return (
    <div className="dash-root">
      <aside className="dash-sidebar" aria-label="Main navigation">
        <div className="dash-sidebar-brand">
          <div className="dash-sidebar-logo" aria-hidden>
            <span className="material-symbols-outlined dash-sidebar-logo-icon">auto_awesome</span>
          </div>
          <div>
            <h1 className="dash-sidebar-title">{APP_BRAND_NAME}</h1>
            <p className="dash-sidebar-tagline">Enterprise HR</p>
          </div>
        </div>

        <nav className="dash-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dash-nav-item ${activeSection === item.id ? 'dash-nav-item--active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="material-symbols-outlined dash-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div className="dash-sidebar-divider" />
          <button
            type="button"
            className={`dash-nav-item ${activeSection === 'settings' ? 'dash-nav-item--active' : ''}`}
            onClick={() => setActiveSection('settings')}
          >
            <span className="material-symbols-outlined dash-nav-icon">settings</span>
            Settings
          </button>
        </nav>

        <div className="dash-sidebar-footer">
          <button
            type="button"
            className="dash-btn-new-interview"
            onClick={() => setActiveSection('workflow')}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              add
            </span>
            New interview
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <header className="dash-topbar">
          <div className="dash-topbar-search-wrap">
            <span className="material-symbols-outlined dash-search-icon">search</span>
            <input
              type="search"
              className="dash-search-input"
              placeholder="Search candidates, jobs, or meetings…"
              readOnly
              aria-label="Search (display only)"
            />
          </div>
          <div className="dash-topbar-actions">
            <div className="dash-topbar-icons">
              <button type="button" className="dash-icon-btn" aria-label="Notifications">
                <span className="material-symbols-outlined">notifications</span>
                <span className="dash-notify-dot" aria-hidden />
              </button>
              <button type="button" className="dash-icon-btn" aria-label="Help">
                <span className="material-symbols-outlined">help_outline</span>
              </button>
            </div>
            <div className="dash-user-block">
              <div className="dash-user-text">
                <p className="dash-user-name">{displayName}</p>
                <p className="dash-user-role">Enterprise access</p>
              </div>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="dash-user-avatar" width={40} height={40} />
              ) : (
                <div className="dash-user-avatar dash-user-avatar--placeholder" aria-hidden>
                  <span className="material-symbols-outlined">person</span>
                </div>
              )}
              <button type="button" className="dash-sign-out" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="dash-canvas">
          {activeSection !== 'overview' && (
            <div className="dash-section-header">
              <h2 className="dash-section-heading">{SECTION_TITLE[activeSection]}</h2>
            </div>
          )}

          {activeSection === 'overview' && (
            <DashboardOverview
              headerActions={
                <>
                  <button
                    type="button"
                    className="dash-btn-secondary"
                    onClick={() => setActiveSection('workflow')}
                  >
                    <span className="material-symbols-outlined">person_add</span>
                    Go to workflow
                  </button>
                  <button
                    type="button"
                    className="dash-btn-primary"
                    onClick={() => setActiveSection('description')}
                  >
                    <span className="material-symbols-outlined">work</span>
                    Manage jobs
                  </button>
                </>
              }
            />
          )}

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

          {activeSection === 'settings' && (
            <div className="dashboard-section dash-settings-placeholder">
              <p className="dash-settings-text">
                Account and workspace preferences live in your Clerk profile and environment. No extra
                settings panel here yet.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
