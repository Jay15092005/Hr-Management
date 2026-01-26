import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@^6.8.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface EmailRequest {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName?: string;
  emailType?: 'selection' | 'join-link';
  interviewDate?: string;
  interviewTime?: string;
  interviewDuration?: number;
  interviewType?: string;
  difficultyLevel?: string;
  codingRound?: boolean;
  joinLink?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { 
      to, 
      candidateName, 
      jobTitle, 
      companyName, 
      emailType = 'selection',
      interviewDate,
      interviewTime,
      interviewDuration,
      interviewType,
      difficultyLevel,
      codingRound,
      joinLink
    }: EmailRequest = await req.json();

    // Validate required fields
    if (!to || !candidateName || !jobTitle) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, candidateName, jobTitle" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Check if Resend API key is configured
    if (!Deno.env.get("RESEND_API_KEY")) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Generate email content based on type
    let emailSubject: string;
    let emailBody: string;

    if (emailType === 'join-link') {
      // Email 2: Join Link Email (sent 5 minutes before interview)
      emailSubject = `Your Interview Starts Soon - Join Link`;
      emailBody = `Dear ${candidateName},

Your interview for the position of ${jobTitle} is scheduled to start soon.

${interviewDate && interviewTime ? `Interview Date & Time: ${interviewDate} at ${interviewTime}` : ''}

Please click the link below to join your interview room:
${joinLink || 'Join link will be available soon'}

Important Notes:
- Please join 5 minutes before your scheduled time
- Ensure you have a stable internet connection
- Have your camera and microphone ready

We look forward to speaking with you!

Best regards,
HR Team
${companyName || "Our Company"}`;
    } else {
      // Email 1: Selection Confirmation (no join link, includes interview details)
      emailSubject = `Congratulations! You've been selected - ${jobTitle}`;
      
      let interviewDetailsSection = '';
      if (interviewDate && interviewTime) {
        interviewDetailsSection = `\nInterview Details:
- Date: ${interviewDate}
- Start Time: ${interviewTime}
- Duration: ${interviewDuration ? `${interviewDuration} minutes` : 'TBD'}
- Interview Type: ${interviewType || 'Technical Interview'}
- Difficulty Level: ${difficultyLevel || 'Medium'}
${codingRound ? '- Coding Round: Yes' : ''}

Important: A secure interview link will be sent to you 5 minutes before your scheduled interview time. Please do not share this link with anyone.

Preparation Instructions:
- Ensure you have a stable internet connection
- Have your camera and microphone ready
- Test your audio and video settings beforehand
- Find a quiet, well-lit space for the interview
${codingRound ? '- Be prepared for a coding assessment' : ''}
- Have your resume and any relevant documents ready`;
      } else {
        interviewDetailsSection = '\nOur HR team will contact you shortly with interview details.';
      }
      
      emailBody = `Dear ${candidateName},

Congratulations! We are pleased to inform you that you have been selected for the position of ${jobTitle}.

Your application stood out among many candidates, and we believe you would be a great addition to our team.
${interviewDetailsSection}

We look forward to welcoming you to our team!

Best regards,
HR Team
${companyName || "Our Company"}`;
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: "HR Team <onboarding@resend.dev>", // Update this with your verified domain
      to: to,
      subject: emailSubject,
      text: emailBody,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: error }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data?.id,
        message: "Email sent successfully" 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
