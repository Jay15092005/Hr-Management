/**
 * Google Gemini API integration for resume evaluation
 */

export interface GeminiEvaluationResult {
  score: number
  missing_skills: string[]
  must_have_matched_skills: string[]
  nice_to_have_matched_skills: string[]
  summary: string
}

export interface GeminiConfig {
  apiKey: string
  model?: string
}

class GeminiService {
  private apiKey: string
  private model: string
  private baseUrl: string

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey
    // Use gemini-2.5-flash by default (better free tier limits)
    // gemini-2.5-pro has stricter quotas and may exceed free tier limits
    this.model = config.model || 'gemini-2.5-flash'
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  }

  /**
   * Evaluate resume against job description using Gemini
   * @param resumeText - The resume text to evaluate
   * @param jobDescription - The job description to compare against
   * @param retryCount - Internal retry counter for overloaded errors
   * @param maxRetries - Maximum number of retries (default: 3)
   */
  async evaluateResume(
    resumeText: string,
    jobDescription: string,
    retryCount = 0,
    maxRetries = 3
  ): Promise<GeminiEvaluationResult> {
    const prompt = `Role: You are an expert Technical HR Recruiter.
Task: Evaluate this resume against the Job Description. Identify skills that are required (must-have) vs preferred (nice-to-have) in the job description, then report which required and preferred skills the candidate has.

Job Description: ${jobDescription}
Resume Text: ${resumeText}

CRITICAL: You must respond with ONLY valid JSON. No markdown, no backticks, no code blocks, no explanations, no extra text. Start with { and end with }.

Required JSON format (return this exact structure):
{
  "score": <integer between 0 and 100>,
  "missing_skills": ["skill1", "skill2"],
  "must_have_matched_skills": ["skill1", "skill2"],
  "nice_to_have_matched_skills": ["skill1", "skill2"],
  "summary": "<one sentence summary>"
}

- missing_skills: skills from the job description (must-have or important) that the resume does NOT clearly show.
- must_have_matched_skills: required/must-have skills from the job description that the resume DOES show.
- nice_to_have_matched_skills: preferred/nice-to-have skills from the job description that the resume DOES show.

Keep each array to at most 8 items so the response is complete. Return ONLY the JSON object starting with { and ending with }. Nothing before, nothing after.`

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `Gemini API error: ${response.statusText}`
        
        // Provide helpful error message for deprecated models
        if (errorMessage.includes('not found') || errorMessage.includes('not supported')) {
          throw new Error(
            `Model error: ${errorMessage}. Please check that you're using a valid model name (e.g., gemini-2.5-flash or gemini-2.5-pro).`
          )
        }
        
        // Handle quota exceeded errors
        if (errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')) {
          const retryAfterMatch = errorMessage.match(/Please retry in ([\d.]+)s/)
          const retryAfter = retryAfterMatch ? parseFloat(retryAfterMatch[1]) : null
          
          throw new Error(
            `Quota exceeded: You've reached your free tier limit. ${
              retryAfter 
                ? `Please wait ${Math.ceil(retryAfter)} seconds before retrying. ` 
                : ''
            }Consider switching to gemini-2.5-flash model (set VITE_GEMINI_MODEL=gemini-2.5-flash) which has better free tier limits.`
          )
        }
        
        // Handle model overloaded errors with automatic retry
        if (
          errorMessage.includes('overloaded') ||
          errorMessage.includes('overload') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429')
        ) {
          if (retryCount < maxRetries) {
            // Exponential backoff: 2^retryCount seconds (2s, 4s, 8s)
            const delaySeconds = Math.pow(2, retryCount) * 1000
            console.log(
              `Model overloaded. Retrying in ${delaySeconds / 1000} seconds... (Attempt ${retryCount + 1}/${maxRetries})`
            )
            
            await new Promise((resolve) => setTimeout(resolve, delaySeconds))
            
            // Retry the request
            return this.evaluateResume(resumeText, jobDescription, retryCount + 1, maxRetries)
          } else {
            throw new Error(
              `Model is overloaded. Tried ${maxRetries} times. Please wait a few minutes and try again.`
            )
          }
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error('Invalid response from Gemini API')
      }

      const responseText = data.candidates[0].content.parts[0].text.trim()

      // Extract JSON using brace matching (handles } inside summary and trailing text)
      let jsonText = responseText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()

      const firstBrace = jsonText.indexOf('{')
      if (firstBrace === -1) {
        throw new Error(
          `Invalid JSON response from Gemini. No JSON object found. Received: ${responseText.substring(0, 200)}...`
        )
      }

      let braceCount = 0
      let endIndex = -1
      for (let i = firstBrace; i < jsonText.length; i++) {
        const c = jsonText[i]
        if (c === '{') braceCount++
        else if (c === '}') {
          braceCount--
          if (braceCount === 0) {
            endIndex = i
            break
          }
        }
      }

      if (endIndex === -1) {
        // Truncated response - retry once
        if (retryCount < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000))
          return this.evaluateResume(resumeText, jobDescription, retryCount + 1, maxRetries)
        }
        throw new Error(
          `Invalid JSON response from Gemini (truncated or malformed). Response: ${responseText.substring(0, 200)}...`
        )
      }

      jsonText = jsonText.substring(firstBrace, endIndex + 1)

      let result
      try {
        result = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        console.error('Attempted to parse:', jsonText.substring(0, 500))
        throw new Error(
          `Failed to parse JSON from Gemini. Please try again. Response preview: ${responseText.substring(0, 200)}...`
        )
      }

      // Validate and normalize result
      return {
        score: Math.max(0, Math.min(100, parseInt(result.score) || 0)),
        missing_skills: Array.isArray(result.missing_skills) ? result.missing_skills : [],
        must_have_matched_skills: Array.isArray(result.must_have_matched_skills)
          ? result.must_have_matched_skills
          : [],
        nice_to_have_matched_skills: Array.isArray(result.nice_to_have_matched_skills)
          ? result.nice_to_have_matched_skills
          : [],
        summary: result.summary || 'No summary provided',
      }
    } catch (error) {
      console.error('Gemini API error:', error)
      throw error
    }
  }
}

// Export singleton instance (will be initialized with API key)
let geminiService: GeminiService | null = null

export function initializeGemini(apiKey: string): void {
  geminiService = new GeminiService({ apiKey })
}

export function getGeminiService(): GeminiService {
  if (!geminiService) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error(
        'Gemini API key not found. Please set VITE_GEMINI_API_KEY in your .env file'
      )
    }
    // Use gemini-2.5-flash as default (fast and cost-effective)
    // Can be changed to gemini-2.5-pro for more powerful reasoning
    const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'
    geminiService = new GeminiService({ apiKey, model })
  }
  return geminiService
}
