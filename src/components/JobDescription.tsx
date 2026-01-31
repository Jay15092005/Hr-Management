import { useState, useEffect } from 'react'
import { supabase, type JobDescription } from '../lib/supabase'
import './JobDescription.css'

interface JobDescriptionProps {
  onJobDescriptionSelect: (jobDescription: JobDescription | null) => void
  compact?: boolean
}

export default function JobDescriptionManager({
  onJobDescriptionSelect,
  compact = false,
}: JobDescriptionProps) {
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([])
  const [selectedJob, setSelectedJob] = useState<JobDescription | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showFullArticle, setShowFullArticle] = useState(false)
  const [editingJob, setEditingJob] = useState<JobDescription | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    required_skills: '',
    min_experience_years: 0,
    location: '',
    degree_required: '',
  })

  useEffect(() => {
    fetchJobDescriptions()
  }, [])

  const fetchJobDescriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('job_descriptions')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setJobDescriptions(data || [])
    } catch (err) {
      console.error('Error fetching job descriptions:', err)
    }
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'min_experience_years' ? parseInt(value) || 0 : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const skillsArray = formData.required_skills
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      if (editingJob) {
        const { error } = await supabase
          .from('job_descriptions')
          .update({
            title: formData.title,
            description: formData.description,
            required_skills: skillsArray,
            min_experience_years: formData.min_experience_years,
            location: formData.location || null,
            degree_required: formData.degree_required || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingJob.id)

        if (error) throw error
        setEditingJob(null)
      } else {
        const { error } = await supabase.from('job_descriptions').insert([
          {
            title: formData.title,
            description: formData.description,
            required_skills: skillsArray,
            min_experience_years: formData.min_experience_years,
            location: formData.location || null,
            degree_required: formData.degree_required || null,
          },
        ])

        if (error) throw error
        setShowForm(false)
      }

      setFormData({
        title: '',
        description: '',
        required_skills: '',
        min_experience_years: 0,
        location: '',
        degree_required: '',
      })
      fetchJobDescriptions()
    } catch (err) {
      console.error(editingJob ? 'Error updating job description:' : 'Error creating job description:', err)
      alert(editingJob ? 'Failed to update job description' : 'Failed to create job description')
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (e: React.MouseEvent, job: JobDescription) => {
    e.stopPropagation()
    setEditingJob(job)
    setFormData({
      title: job.title,
      description: job.description,
      required_skills: job.required_skills?.join(', ') ?? '',
      min_experience_years: job.min_experience_years ?? 0,
      location: job.location ?? '',
      degree_required: job.degree_required ?? '',
    })
  }

  const handleSelectJob = (job: JobDescription) => {
    setSelectedJob(job)
    if (!compact) onJobDescriptionSelect(job)
  }

  const handleApply = () => {
    if (selectedJob) onJobDescriptionSelect(selectedJob)
  }

  if (compact) {
    return (
      <div className="job-description-container compact">
        <h2 className="section-title">
          Job description we want
          <button
            type="button"
            className="btn-show-full"
            onClick={() => setShowFullArticle((v) => !v)}
          >
            👁 {showFullArticle ? 'Hide' : 'Show full article'}
          </button>
        </h2>
        <div className="job-list-oneline">
          {jobDescriptions.length === 0 ? (
            <p className="empty-msg">No job descriptions. Add one from Description tab.</p>
          ) : (
            jobDescriptions.map((job) => (
              <div
                key={job.id}
                className={`job-oneline ${selectedJob?.id === job.id ? 'selected' : ''}`}
                onClick={() => setSelectedJob(job)}
              >
                <span className="job-oneline-text">
                  {job.title} – {job.description.substring(0, 50)}... – {job.required_skills?.slice(0, 3).join(', ')} – {job.min_experience_years}+ yrs
                </span>
                <button
                  type="button"
                  className="btn-edit-job"
                  onClick={(e) => handleEditClick(e, job)}
                  title="Edit job description"
                  aria-label="Edit"
                >
                  ✏️
                </button>
              </div>
            ))
          )}
        </div>
        {showFullArticle && selectedJob && (
          <div className="job-full-article">
            <h3>{selectedJob.title}</h3>
            <p>{selectedJob.description}</p>
            <p>Skills: {selectedJob.required_skills?.join(', ')} | Experience: {selectedJob.min_experience_years}+ years</p>
          </div>
        )}
        {editingJob && (
          <div className="job-edit-form-compact">
            <h3>Edit job description</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Job Title *</label>
                <input type="text" name="title" value={formData.title} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} required rows={4} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Required Skills (comma-separated)</label>
                  <input type="text" name="required_skills" value={formData.required_skills} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Min Experience (Years)</label>
                  <input type="number" name="min_experience_years" value={formData.min_experience_years} onChange={handleInputChange} min={0} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Location</label>
                  <input type="text" name="location" value={formData.location} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Degree Required</label>
                  <input type="text" name="degree_required" value={formData.degree_required} onChange={handleInputChange} />
                </div>
              </div>
              <div className="job-edit-actions">
                <button type="button" className="btn-cancel-edit" onClick={() => { setEditingJob(null); setFormData({ title: '', description: '', required_skills: '', min_experience_years: 0, location: '', degree_required: '' }); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-save-job" disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}
        <button
          type="button"
          className="btn-apply-job"
          onClick={handleApply}
          disabled={!selectedJob}
        >
          APPLY
        </button>
      </div>
    )
  }

  return (
    <div className="job-description-container">
      <div className="job-description-header">
        <h2>Job Descriptions</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Cancel' : '+ New Job Description'}
        </button>
      </div>

      {showForm && (
        <div className="job-form-card">
          <h3>Create New Job Description</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Job Title *</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                placeholder="e.g., Senior Software Engineer"
              />
            </div>

            <div className="form-group">
              <label>Description *</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                rows={6}
                placeholder="Enter detailed job description..."
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Required Skills (comma-separated)</label>
                <input
                  type="text"
                  name="required_skills"
                  value={formData.required_skills}
                  onChange={handleInputChange}
                  placeholder="e.g., React, Node.js, Python"
                />
              </div>

              <div className="form-group">
                <label>Min Experience (Years)</label>
                <input
                  type="number"
                  name="min_experience_years"
                  value={formData.min_experience_years}
                  onChange={handleInputChange}
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="e.g., India, Remote"
                />
              </div>

              <div className="form-group">
                <label>Degree Required</label>
                <input
                  type="text"
                  name="degree_required"
                  value={formData.degree_required}
                  onChange={handleInputChange}
                  placeholder="e.g., B.Tech, MCA"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Job Description'}
            </button>
          </form>
        </div>
      )}

      <div className="job-list">
        {jobDescriptions.length === 0 ? (
          <div className="empty-state">
            <p>No job descriptions yet. Create one to start evaluating resumes.</p>
          </div>
        ) : (
          jobDescriptions.map((job) => (
            <div
              key={job.id}
              className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''}`}
              onClick={() => handleSelectJob(job)}
            >
              <div className="job-card-header">
                <h3>{job.title}</h3>
                {job.is_active && <span className="badge-active">Active</span>}
              </div>
              <p className="job-description-text">
                {job.description.substring(0, 150)}
                {job.description.length > 150 ? '...' : ''}
              </p>
              <div className="job-meta">
                <span>Experience: {job.min_experience_years}+ years</span>
                {job.location && <span>Location: {job.location}</span>}
                {job.degree_required && (
                  <span>Degree: {job.degree_required}</span>
                )}
              </div>
              {job.required_skills.length > 0 && (
                <div className="job-skills">
                  <strong>Skills:</strong>{' '}
                  {job.required_skills.slice(0, 5).join(', ')}
                  {job.required_skills.length > 5 && '...'}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
