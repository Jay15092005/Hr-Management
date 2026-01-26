/**
 * Email utility for sending candidate selection emails
 * Uses Supabase Edge Function with Resend
 */

import { supabase } from '../lib/supabase'

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
}

/**
 * Send selection confirmation email (Email 1) - No join link
 */
export async function sendSelectionEmail(data: EmailData): Promise<boolean> {
  try {
    // Call Supabase Edge Function
    const { data: result, error } = await supabase.functions.invoke('send-selection-email', {
      body: {
        to: data.to,
        candidateName: data.candidateName,
        jobTitle: data.jobTitle,
        companyName: data.companyName,
        emailType: 'selection',
        interviewDate: data.interviewDate,
        interviewTime: data.interviewTime,
        interviewDuration: data.interviewDuration,
        interviewType: data.interviewType,
        difficultyLevel: data.difficultyLevel,
        codingRound: data.codingRound,
      },
    })

    if (error) {
      console.error('Error calling edge function:', error)
      throw error
    }

    if (result?.success) {
      console.log('Selection email sent successfully:', result.messageId)
      return true
    } else {
      console.error('Email sending failed:', result?.error)
      return false
    }
  } catch (error) {
    console.error('Error sending email:', error)
    return false
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
