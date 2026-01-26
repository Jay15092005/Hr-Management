import { useState } from 'react'
import { type Resume, type JobDescription } from '../lib/supabase'
import HRFilters from './HRFilters'
import JobDescriptionManager from './JobDescription'
import AIScoring from './AIScoring'
import HRReview from './HRReview'
import './HRWorkflow.css'

export default function HRWorkflow() {
  const [filteredResumes, setFilteredResumes] = useState<Resume[]>([])
  const [selectedJobDescription, setSelectedJobDescription] =
    useState<JobDescription | null>(null)
  const [activeStep, setActiveStep] = useState<'filter' | 'evaluate' | 'review'>('filter')

  const handleFilteredResumes = (resumes: Resume[]) => {
    setFilteredResumes(resumes)
    if (resumes.length > 0) {
      setActiveStep('evaluate')
    }
  }

  const handleClearFilters = () => {
    setFilteredResumes([])
    setActiveStep('filter')
  }

  const handleJobDescriptionSelect = (job: JobDescription | null) => {
    setSelectedJobDescription(job)
  }

  return (
    <div className="hr-workflow-container">
      <div className="workflow-header">
        <h1>HR Workflow</h1>
        <p className="workflow-subtitle">
          Step 1: Filter Resumes → Step 2: AI Evaluation → Step 3: HR Review & Selection
        </p>
      </div>

      <div className="workflow-steps">
        <div
          className={`step-indicator ${activeStep === 'filter' ? 'active' : ''}`}
          onClick={() => setActiveStep('filter')}
        >
          <span className="step-number">1</span>
          <span className="step-label">HR Filters</span>
        </div>
        <div className="step-connector"></div>
        <div
          className={`step-indicator ${activeStep === 'evaluate' ? 'active' : ''}`}
          onClick={() => setActiveStep('evaluate')}
        >
          <span className="step-number">2</span>
          <span className="step-label">AI Evaluation</span>
        </div>
        <div className="step-connector"></div>
        <div
          className={`step-indicator ${activeStep === 'review' ? 'active' : ''}`}
          onClick={() => setActiveStep('review')}
        >
          <span className="step-number">3</span>
          <span className="step-label">HR Review</span>
        </div>
      </div>

      <div className="workflow-content">
        {activeStep === 'filter' && (
          <div className="workflow-section">
            <HRFilters
              onFilteredResumes={handleFilteredResumes}
              onClearFilters={handleClearFilters}
            />
            {filteredResumes.length > 0 && (
              <div className="filter-results">
                <h3>Filtered Results: {filteredResumes.length} resumes</h3>
                <button
                  onClick={() => setActiveStep('evaluate')}
                  className="btn-primary"
                >
                  Proceed to AI Evaluation →
                </button>
              </div>
            )}
          </div>
        )}

        {activeStep === 'evaluate' && (
          <div className="workflow-section">
            <div className="evaluation-setup">
              <JobDescriptionManager
                onJobDescriptionSelect={handleJobDescriptionSelect}
              />
            </div>
            {selectedJobDescription && (
              <div className="evaluation-results">
                <AIScoring
                  resumes={filteredResumes}
                  jobDescription={selectedJobDescription}
                />
                <div className="workflow-navigation">
                  <button
                    onClick={() => setActiveStep('review')}
                    className="btn-primary"
                  >
                    Proceed to HR Review →
                  </button>
                </div>
              </div>
            )}
            {!selectedJobDescription && (
              <div className="info-box">
                <p>Select a job description above to start AI evaluation</p>
              </div>
            )}
          </div>
        )}

        {activeStep === 'review' && (
          <div className="workflow-section">
            <HRReview jobDescription={selectedJobDescription} />
          </div>
        )}
      </div>
    </div>
  )
}
