import { useState } from 'react'
import { supabase, type Resume, type JobDescription, type ResumeScore } from '../lib/supabase'
import { getGeminiService } from '../lib/gemini'
import { extractResumeTextFromUrl } from '../utils/resumeParser'
import './AIScoring.css'

interface AIScoringProps {
  resumes: Resume[]
  jobDescription: JobDescription | null
  compact?: boolean
}

export default function AIScoring({ resumes, jobDescription, compact = false }: AIScoringProps) {
  const [evaluating, setEvaluating] = useState<string | null>(null)
  const [scores, setScores] = useState<Map<string, ResumeScore>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const evaluateResume = async (resume: Resume, retryCount = 0) => {
    if (!jobDescription) {
      alert('Please select a job description first')
      return
    }

    if (!resume.resume_file_url) {
      alert('Resume file not available')
      return
    }

    setEvaluating(resume.id)
    setError(null)

    try {
      // Check if already evaluated
      const { data: existingScore } = await supabase
        .from('resume_scores')
        .select('*')
        .eq('resume_id', resume.id)
        .eq('job_description_id', jobDescription.id)
        .maybeSingle()

      if (existingScore) {
        setScores((prev) => new Map(prev.set(resume.id, existingScore)))
        setEvaluating(null)
        return
      }

      // Extract text from resume (PDF, DOCX, TXT)
      let resumeText = ''
      try {
        resumeText = await extractResumeTextFromUrl(resume.resume_file_url)
      } catch (err) {
        console.warn('Could not extract text from resume file, using basic info:', err)
        // Fallback to basic candidate info if extraction fails
        resumeText = `Candidate Name: ${resume.name}\nEmail: ${resume.email}\nExperience: ${resume.years_of_experience || 0} years\nLocation: ${resume.location || 'Not specified'}\nDegree: ${resume.degree || 'Not specified'}`
      }

      // Call Gemini API
      const gemini = getGeminiService()
      const evaluation = await gemini.evaluateResume(
        resumeText,
        jobDescription.description
      )

      // Save to database
      const { data: scoreData, error: dbError } = await supabase
        .from('resume_scores')
        .insert([
          {
            resume_id: resume.id,
            job_description_id: jobDescription.id,
            score: evaluation.score,
            missing_skills: evaluation.missing_skills,
            must_have_matched_skills: evaluation.must_have_matched_skills,
            nice_to_have_matched_skills: evaluation.nice_to_have_matched_skills,
            summary: evaluation.summary,
            resume_text: resumeText,
          },
        ])
        .select()
        .single()

      if (dbError) throw dbError

      setScores((prev) => new Map(prev.set(resume.id, scoreData)))
    } catch (err) {
      console.error('Evaluation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to evaluate resume'
      
      // Show user-friendly error messages
      if (errorMessage.includes('API key')) {
        setError('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.')
      } else if (errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')) {
        setError(errorMessage)
        
        // Extract retry time if available
        const retryMatch = errorMessage.match(/wait ([\d]+) seconds/)
        if (retryMatch && retryCount < 1) {
          const waitTime = parseInt(retryMatch[1])
          setTimeout(() => {
            evaluateResume(resume, retryCount + 1)
          }, (waitTime + 1) * 1000)
          return // Don't clear evaluating state yet
        }
      } else if (errorMessage.includes('overloaded') || errorMessage.includes('overload')) {
        setError(
          `Model is temporarily overloaded. The system will automatically retry. ${errorMessage}`
        )
        // The retry is handled in the Gemini service, so we'll wait a bit
        setTimeout(() => {
          setError(null)
        }, 5000)
      } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
        setError(
          `JSON parsing error: The AI response format was invalid. ${errorMessage}. Please try again.`
        )
      } else if (errorMessage.includes('Model error') || errorMessage.includes('not found')) {
        setError(errorMessage)
      } else {
        setError(`Evaluation failed: ${errorMessage}`)
      }
    } finally {
      setEvaluating(null)
    }
  }

  const evaluateAllResumes = async () => {
    if (!jobDescription) {
      alert('Please select a job description first')
      return
    }

    // Evaluate resumes one at a time with delays to avoid overload
    for (let i = 0; i < resumes.length; i++) {
      const resume = resumes[i]
      if (resume.resume_file_url) {
        await evaluateResume(resume)
        // Longer delay between evaluations to avoid overload (3 seconds)
        if (i < resumes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4caf50'
    if (score >= 60) return '#ff9800'
    return '#f44336'
  }

  if (!jobDescription) {
    return (
      <div className="ai-scoring-container">
        <div className="info-message">
          Please select a job description to start AI evaluation
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="ai-scoring-container compact">
        <div className="scoring-header-compact">
          <h2 className="section-title">Person Name</h2>
          {resumes.length > 0 && (
            <button onClick={evaluateAllResumes} className="btn-evaluate-all" disabled={evaluating !== null}>
              {evaluating ? 'Evaluating...' : 'Evaluate All'}
            </button>
          )}
        </div>
        {error && <div className="error-message">{error}</div>}
        <div className="scores-list-compact">
          {resumes.map((resume) => {
            const score = scores.get(resume.id)
            const isEvaluating = evaluating === resume.id
            return (
              <div key={resume.id} className="score-row-compact">
                <span className="name">{resume.name}</span>
                {score ? (
                  <span className="score-badge" style={{ backgroundColor: getScoreColor(score.score) }}>
                    {score.score}/100
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-eval-one"
                    onClick={() => evaluateResume(resume)}
                    disabled={!resume.resume_file_url || evaluating !== null}
                  >
                    {isEvaluating ? '...' : 'Evaluate'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {resumes.length === 0 && <p className="empty-msg">No resumes. Apply filters first.</p>}
      </div>
    )
  }

  return (
    <div className="ai-scoring-container">
      <div className="scoring-header">
        <h2>AI Resume Evaluation</h2>
        <p className="scoring-subtitle">
          Evaluating resumes against: <strong>{jobDescription.title}</strong>
        </p>
        <div className="scoring-info">
          <p className="model-info">
            Using model: <strong>{import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'}</strong>
            {import.meta.env.VITE_GEMINI_MODEL === 'gemini-2.5-pro' && (
              <span className="warning-badge">⚠️ Higher quota limits</span>
            )}
          </p>
        </div>
        {resumes.length > 0 && (
          <button onClick={evaluateAllResumes} className="btn-primary">
            Evaluate All Resumes
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="scores-grid">
        {resumes.map((resume) => {
          const score = scores.get(resume.id)
          const isEvaluating = evaluating === resume.id

          return (
            <div key={resume.id} className="score-card">
              <div className="score-card-header">
                <h3>{resume.name}</h3>
                {score && (
                  <div
                    className="score-badge"
                    style={{ backgroundColor: getScoreColor(score.score) }}
                  >
                    {score.score}/100
                  </div>
                )}
              </div>

              <div className="score-card-body">
                <p className="candidate-email">{resume.email}</p>

                {score ? (
                  <div className="score-details">
                    <div className="score-summary">
                      <strong>Summary:</strong> {score.summary}
                    </div>
                    {(score.must_have_matched_skills?.length ?? 0) > 0 && (
                      <div className="matched-skills must-have">
                        <strong>Must-have matched:</strong>
                        <ul>
                          {(score.must_have_matched_skills ?? []).map((skill, idx) => (
                            <li key={idx}>{skill}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(score.nice_to_have_matched_skills?.length ?? 0) > 0 && (
                      <div className="matched-skills nice-to-have">
                        <strong>Nice-to-have matched:</strong>
                        <ul>
                          {(score.nice_to_have_matched_skills ?? []).map((skill, idx) => (
                            <li key={idx}>{skill}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {score.missing_skills.length > 0 && (
                      <div className="missing-skills">
                        <strong>Missing Skills:</strong>
                        <ul>
                          {score.missing_skills.map((skill, idx) => (
                            <li key={idx}>{skill}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="no-score">
                    {isEvaluating ? (
                      <div className="evaluating">
                        <span>Evaluating...</span>
                        {evaluating === resume.id && (
                          <div className="evaluating-spinner">⏳</div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => evaluateResume(resume)}
                        className="btn-evaluate"
                        disabled={!resume.resume_file_url || evaluating !== null}
                      >
                        Evaluate Resume
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {resumes.length === 0 && (
        <div className="empty-state">
          <p>No resumes to evaluate. Filter resumes first.</p>
        </div>
      )}
    </div>
  )
}
