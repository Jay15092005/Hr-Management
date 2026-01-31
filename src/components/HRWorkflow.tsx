import { type Resume, type JobDescription } from '../lib/supabase'
import HRFilters from './HRFilters'
import JobDescriptionManager from './JobDescription'
import CandidatesTable from './CandidatesTable'
import './HRWorkflow.css'

interface HRWorkflowProps {
  selectedJobDescription: JobDescription | null
  setSelectedJobDescription: (job: JobDescription | null) => void
  filteredResumes: Resume[]
  setFilteredResumes: (resumes: Resume[]) => void
}

export default function HRWorkflow({
  selectedJobDescription,
  setSelectedJobDescription,
  filteredResumes,
  setFilteredResumes,
}: HRWorkflowProps) {
  const handleFilteredResumes = (resumes: Resume[]) => {
    setFilteredResumes(resumes)
  }

  const handleClearFilters = () => {
    setFilteredResumes([])
  }

  const handleJobDescriptionSelect = (job: JobDescription | null) => {
    setSelectedJobDescription(job)
  }

  return (
    <div className="hr-workflow-container simple-layout">
      <section className="workflow-section-block">
        <h2 className="section-title">HR filters</h2>
        <HRFilters
          onFilteredResumes={handleFilteredResumes}
          onClearFilters={handleClearFilters}
          compact
        />
      </section>

      <section className="workflow-section-block">
        <JobDescriptionManager
          onJobDescriptionSelect={handleJobDescriptionSelect}
          compact
        />
      </section>

      {selectedJobDescription && (
        <section className="workflow-section-block">
          <CandidatesTable
            resumes={filteredResumes}
            jobDescription={selectedJobDescription}
          />
        </section>
      )}

      {!selectedJobDescription && filteredResumes.length > 0 && (
        <div className="workflow-hint">Select a job above and click APPLY to see candidates.</div>
      )}
    </div>
  )
}
