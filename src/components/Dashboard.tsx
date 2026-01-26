import { useState } from 'react'
import UploadResume from './UploadResume'
import ResumeList from './ResumeList'
import HRWorkflow from './HRWorkflow'
import './Dashboard.css'

type Section = 'upload' | 'list' | 'workflow'

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<Section>('list')
  const [refreshKey, setRefreshKey] = useState(0)

  const handleUploadSuccess = () => {
    // Trigger refresh of resume list
    setRefreshKey((prev) => prev + 1)
    // Optionally switch to list view after upload
    // setActiveSection('list')
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>HR Management Dashboard</h1>
        <p className="dashboard-subtitle">Manage candidate resumes and applications</p>
      </div>

      <div className="dashboard-navigation">
        <button
          className={`nav-button ${activeSection === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveSection('upload')}
        >
          <span className="nav-icon">📤</span>
          <span>Upload Resume</span>
        </button>
        <button
          className={`nav-button ${activeSection === 'list' ? 'active' : ''}`}
          onClick={() => setActiveSection('list')}
        >
          <span className="nav-icon">📋</span>
          <span>Resume List</span>
        </button>
        <button
          className={`nav-button ${activeSection === 'workflow' ? 'active' : ''}`}
          onClick={() => setActiveSection('workflow')}
        >
          <span className="nav-icon">⚙️</span>
          <span>HR Workflow</span>
        </button>
      </div>

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

        {activeSection === 'workflow' && (
          <div className="dashboard-section">
            <HRWorkflow />
          </div>
        )}
      </div>
    </div>
  )
}
