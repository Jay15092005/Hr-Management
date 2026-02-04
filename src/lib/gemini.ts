/**
 * Google Gemini API integration for resume evaluation
 */

export interface GeminiEvaluationResult {
  score: number
  missing_skills: string[]
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
Task: Evaluate this resume against the Job Description.

Job Description: ${jobDescription}
Resume Text: ${resumeText}

CRITICAL: You must respond with ONLY valid JSON. No markdown, no backticks, no code blocks, no explanations, no extra text. Start with { and end with }.

Required JSON format (return this exact structure):
{
  "score": <integer between 0 and 100>,
  "missing_skills": ["skill1", "skill2"],
  "summary": "<one sentence summary>"
}

Return ONLY the JSON object starting with { and ending with }. Nothing before, nothing after.`

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
              temperature: 0.1, // Very low temperature for consistent JSON output
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json', // Request JSON response format
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
            `Quota exceeded: You've reached your free tier limit. ${retryAfter
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

      // Extract JSON from response (handle markdown code blocks and various formats)
      let jsonText = responseText

      // Step 1: Remove markdown code blocks if present
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '') // Remove opening ```
      jsonText = jsonText.replace(/\s*```$/i, '') // Remove closing ```
      jsonText = jsonText.trim()

      // Step 2: Fix double curly braces (common Gemini issue: {{ instead of {)
      // Handle cases like: {{ "score": ... }} or { { "score": ... } }
      jsonText = jsonText.replace(/^\{\s*\{/, '{') // Replace {{ with {
      jsonText = jsonText.replace(/\}\s*\}\s*$/, '}') // Replace }} with }

      // Step 3: Find the JSON object (handle extra text before/after)
      const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0]
      }

      // Step 4: Clean up any remaining artifacts
      jsonText = jsonText.replace(/^`+|`+$/g, '') // Remove backticks
      jsonText = jsonText.replace(/^\s+|\s+$/g, '') // Remove whitespace

      // Step 5: Fix any remaining double braces or formatting issues
      // Remove any leading text before first {
      const firstBraceIndex = jsonText.indexOf('{')
      if (firstBraceIndex > 0) {
        jsonText = jsonText.substring(firstBraceIndex)
      }

      // Remove any trailing text after last }
      const lastBraceIndex = jsonText.lastIndexOf('}')
      if (lastBraceIndex >= 0 && lastBraceIndex < jsonText.length - 1) {
        jsonText = jsonText.substring(0, lastBraceIndex + 1)
      }

      // Final cleanup: ensure single braces
      jsonText = jsonText.replace(/^\{\s*\{/, '{')
      jsonText = jsonText.replace(/\}\s*\}\s*$/, '}')
      jsonText = jsonText.trim()

      // Validate that we have something that looks like JSON
      if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) {
        throw new Error(
          `Invalid JSON response from Gemini. Expected JSON object but received: ${responseText.substring(0, 200)}...`
        )
      }

      let result
      try {
        result = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        console.error('Attempted to parse:', jsonText.substring(0, 500))
        console.error('Full original response:', responseText)

        // Last resort: try to extract just the JSON part more aggressively
        try {
          // Find the innermost complete JSON object
          let braceCount = 0
          let startIndex = -1
          let endIndex = -1

          for (let i = 0; i < responseText.length; i++) {
            if (responseText[i] === '{') {
              if (startIndex === -1) startIndex = i
              braceCount++
            } else if (responseText[i] === '}') {
              braceCount--
              if (braceCount === 0 && startIndex !== -1) {
                endIndex = i
                break
              }
            }
          }

          if (startIndex !== -1 && endIndex !== -1) {
            jsonText = responseText.substring(startIndex, endIndex + 1)
            result = JSON.parse(jsonText)
            console.log('Successfully parsed after aggressive extraction')
          } else {
            throw parseError
          }
        } catch (finalError) {
          const errorMessage = parseError instanceof Error ? parseError.message : String(parseError)
          throw new Error(
            `Failed to parse JSON response. Gemini returned invalid JSON format. Please try again. Error: ${errorMessage}. Response preview: ${responseText.substring(0, 300)}...`
          )
        }
      }

      // Validate and normalize result
      return {
        score: Math.max(0, Math.min(100, parseInt(result.score) || 0)),
        missing_skills: Array.isArray(result.missing_skills)
          ? result.missing_skills
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
