import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { type Resume, type JobDescription } from './lib/supabase'
import './App.css'

export type WorkflowContext = {
  selectedJobDescription: JobDescription | null
  setSelectedJobDescription: (job: JobDescription | null) => void
  filteredResumes: Resume[]
  setFilteredResumes: (resumes: Resume[]) => void
}

function App() {
  const [selectedJobDescription, setSelectedJobDescription] =
    useState<JobDescription | null>(null)
  const [filteredResumes, setFilteredResumes] = useState<Resume[]>([])

  return (
    <div className="App">
      <Outlet
        context={
          {
            selectedJobDescription,
            setSelectedJobDescription,
            filteredResumes,
            setFilteredResumes,
          } satisfies WorkflowContext
        }
      />
    </div>
  )
}

export default App
