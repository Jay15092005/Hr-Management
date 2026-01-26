import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadResume } from '../utils/storage'
import './UploadResume.css'

interface UploadResumeProps {
  onUploadSuccess: () => void
}

export default function UploadResume({ onUploadSuccess }: UploadResumeProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    years_of_experience: 0,
    location: '',
    degree: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    setError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ]
      
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.')
        return
      }

      // Validate file size (50MB)
      const maxSize = 50 * 1024 * 1024
      if (selectedFile.size > maxSize) {
        setError('File size exceeds 50MB limit.')
        return
      }

      setFile(selectedFile)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validation
    if (!formData.name.trim()) {
      setError('Please enter candidate name')
      return
    }

    if (!formData.email.trim()) {
      setError('Please enter candidate email')
      return
    }

    if (!file) {
      setError('Please select a resume file')
      return
    }

    setUploading(true)

    try {
      // Step 1: Upload file to Supabase Storage
      const uploadResult = await uploadResume(file, formData.name)

      if (!uploadResult.success || !uploadResult.url || !uploadResult.path) {
        throw new Error(uploadResult.error || 'Failed to upload file')
      }

      // Step 2: Save resume data to database
      const { error: dbError } = await supabase
        .from('resumes')
        .insert([
          {
            name: formData.name.trim(),
            email: formData.email.trim(),
            resume_file_url: uploadResult.url,
            resume_file_name: file.name,
            years_of_experience: formData.years_of_experience || null,
            location: formData.location.trim() || null,
            degree: formData.degree.trim() || null,
            date_of_application: new Date().toISOString(),
          },
        ])
        .select()

      if (dbError) throw dbError

      // Success!
      setSuccess(true)
      setFormData({
        name: '',
        email: '',
        years_of_experience: 0,
        location: '',
        degree: '',
      })
      setFile(null)
      
      // Reset file input
      const fileInput = document.getElementById('resume-file') as HTMLInputElement
      if (fileInput) fileInput.value = ''

      // Callback to refresh the list
      setTimeout(() => {
        onUploadSuccess()
        setSuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload resume')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload-resume-container">
      <div className="upload-resume-card">
        <h2>Upload New Resume</h2>
        <p className="upload-subtitle">Add a new candidate resume to the system</p>

        <form onSubmit={handleSubmit} className="upload-form">
          <div className="form-group">
            <label htmlFor="name">Candidate Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter candidate name"
              required
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="candidate@example.com"
              required
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="resume-file">Resume File *</label>
            <div className="file-input-wrapper">
              <input
                type="file"
                id="resume-file"
                name="resume-file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileChange}
                disabled={uploading}
                required
              />
              <div className="file-input-info">
                {file ? (
                  <span className="file-selected">
                    📄 {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </span>
                ) : (
                  <span className="file-placeholder">
                    Choose a file (PDF, DOC, DOCX, TXT - Max 50MB)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="experience">Years of Experience</label>
              <input
                type="number"
                id="experience"
                name="years_of_experience"
                value={formData.years_of_experience}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    years_of_experience: parseInt(e.target.value) || 0,
                  }))
                }
                min="0"
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="e.g., India, Remote"
                disabled={uploading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="degree">Degree</label>
              <input
                type="text"
                id="degree"
                name="degree"
                value={formData.degree}
                onChange={handleInputChange}
                placeholder="e.g., B.Tech, MCA"
                disabled={uploading}
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">✓ Resume uploaded successfully!</div>}

          <button
            type="submit"
            className="upload-button"
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Resume'}
          </button>
        </form>
      </div>
    </div>
  )
}
