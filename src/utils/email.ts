/**
 * Email utility for sending candidate selection emails
 * Uses Supabase Edge Function with Resend
 */

import { supabase } from '../lib/supabase'

export interface TimeSlotOption {
  at: string   // ISO datetime
  label: string
}

export interface EmailData {
  to: string
  candidateName: string
  jobTitle: string
  companyName?: string
  interviewDate?: string
  interviewTime?: string
  interviewDuration?: number
  interviewType?: string
  difficultyLevel?: string
  codingRound?: boolean
  /** When set, selection email can include "Pick your interview time" links */
  candidateSelectionId?: string
  timeSlots?: TimeSlotOption[]
  confirmBaseUrl?: string
}

export interface SendSelectionEmailResult {
  ok: boolean
  error?: string
  messageId?: string
}

/**
 * Send selection confirmation email (Email 1) - No join link
 */
export async function sendSelectionEmail(data: EmailData): Promise<SendSelectionEmailResult> {
  const payload = {
    to: data.to,
    candidateName: data.candidateName,
    jobTitle: data.jobTitle,
    companyName: data.companyName,
    emailType: 'selection' as const,
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewDuration: data.interviewDuration,
    interviewType: data.interviewType,
    difficultyLevel: data.difficultyLevel,
    codingRound: data.codingRound,
    candidateSelectionId: data.candidateSelectionId,
    timeSlots: data.timeSlots,
    confirmBaseUrl: data.confirmBaseUrl,
  }
  console.log('[Email] Sending selection email:', {
    to: data.to,
    jobTitle: data.jobTitle,
    hasSelectionId: !!data.candidateSelectionId,
    timeSlotsCount: data.timeSlots?.length ?? 0,
    confirmBaseUrl: data.confirmBaseUrl || '(none)',
  })
  try {
    const { data: result, error } = await supabase.functions.invoke('send-selection-email', {
      body: payload,
    })
    if (error) {
      console.error('[Email] Edge function error:', error)
      return { ok: false, error: error.message || String(error) }
    }
    console.log('[Email] Edge function response:', result)
    if (result?.success) {
      console.log('[Email] Selection email sent successfully, messageId:', result.messageId)
      return { ok: true, messageId: result.messageId }
    }
    const errMsg = result?.error || 'Unknown error from send-selection-email'
    console.error('[Email] Send failed:', errMsg, result?.details)
    return { ok: false, error: errMsg }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Email] Exception sending email:', error)
    return { ok: false, error: errMsg }
  }
}

function getEmailTemplate(data: EmailData): string {
  return `Dear ${data.candidateName},

Congratulations! We are pleased to inform you that you have been selected for the position of ${data.jobTitle}.

Your application stood out among many candidates, and we believe you would be a great addition to our team.

Next Steps:
- Our HR team will contact you shortly to discuss the next steps in the hiring process.
- Please be prepared to provide any additional documentation if required.

We look forward to welcoming you to our team!

Best regards,
HR Team
${data.companyName || 'Our Company'}`
}

/**
 * Generate email content for selection notification
 */
export function getSelectionEmailContent(data: EmailData) {
  return {
    subject: `Congratulations! You've been selected - ${data.jobTitle}`,
    body: getEmailTemplate(data),
    to: data.to,
  }
}
