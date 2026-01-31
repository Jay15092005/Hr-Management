import { useState, useEffect } from 'react'
import { useOutletContext, useLocation } from 'react-router-dom'
import type { WorkflowContext } from '../App'
import UploadResume from './UploadResume'
import ResumeList from './ResumeList'
import HRWorkflow from './HRWorkflow'
import JobDescriptionManager from './JobDescription'
import './Dashboard.css'

type Section = 'upload' | 'list' | 'description' | 'workflow'

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

  useEffect(() => {
    if (location.state?.section === 'workflow') {
      setActiveSection('workflow')
    }
  }, [location.state?.section])

  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header-bar">
        <div className="header-date">{getDateDisplay()}</div>
        <nav className="dashboard-nav">
          <button
            className={`nav-btn ${activeSection === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveSection('upload')}
          >
            <span className="nav-icon">📄</span>
            Upload Resume New
          </button>
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
      </div>
    </div>
  )
}
