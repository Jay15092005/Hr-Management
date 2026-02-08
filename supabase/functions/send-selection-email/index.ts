import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@^6.8.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const confirmSecret = Deno.env.get("CONFIRM_INTERVIEW_SECRET") || "";

interface TimeSlot {
  at: string;   // ISO datetime
  label: string;
}

interface EmailRequest {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName?: string;
  emailType?: 'selection' | 'join-link' | 'slot-confirmed';
  interviewDate?: string;
  interviewTime?: string;
  interviewDuration?: number;
  interviewType?: string;
  difficultyLevel?: string;
  codingRound?: boolean;
  joinLink?: string;
  candidateSelectionId?: string;
  timeSlots?: TimeSlot[];
  confirmBaseUrl?: string;
  scheduledAtLabel?: string;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signSlotToken(selectionId: string, slot: string): Promise<string> {
  const message = new TextEncoder().encode(selectionId + slot);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(confirmSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return base64UrlEncode(sig);
}

async function signScheduleToken(selectionId: string): Promise<string> {
  const message = new TextEncoder().encode(selectionId + "schedule");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(confirmSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  return base64UrlEncode(sig);
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
    const body = await req.json();
    console.log("[send-selection-email] Request received, to:", body?.to, "jobTitle:", body?.jobTitle, "emailType:", body?.emailType);
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
      joinLink,
      candidateSelectionId,
      timeSlots,
      confirmBaseUrl,
      scheduledAtLabel,
    }: EmailRequest = body;

    // Validate required fields
    if (!to || !candidateName || !jobTitle) {
      console.error("[send-selection-email] Validation failed: missing to, candidateName, or jobTitle");
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
      console.error("[send-selection-email] RESEND_API_KEY not set");
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
    let pickTimeSectionHtml = '';
    let interviewDetailsSection = '';

    if (emailType === 'slot-confirmed') {
      emailSubject = `Interview slot confirmed - ${jobTitle}`;
      emailBody = `Dear ${candidateName},

You have selected the following slot for your interview for the position of ${jobTitle}:

${scheduledAtLabel || 'Your chosen date and time'}

A join link will be sent to your email 5 minutes before the interview. Please ensure you have a stable internet connection and your camera/microphone ready.

Best regards,
HR Team
${companyName || "Our Company"}`;
    } else if (emailType === 'join-link') {
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

      let pickTimeSection = '';
      if (candidateSelectionId && confirmBaseUrl && confirmSecret) {
        const scheduleToken = await signScheduleToken(candidateSelectionId);
        const scheduleUrl = `${confirmBaseUrl.replace(/\/$/, "")}/schedule-interview?selectionId=${encodeURIComponent(candidateSelectionId)}&token=${encodeURIComponent(scheduleToken)}`;
        const scheduleOwnText = `\nOr pick your own date & time: ${scheduleUrl}\n`;
        const scheduleOwnHtml = `<p style="margin:12px 0 0 0;"><a href="${scheduleUrl}" style="display:inline-block;padding:10px 18px;background:#059669;color:#fff;text-decoration:none;border-radius:6px;">📅 Schedule your slot (any date & time)</a></p>`;
        if (timeSlots?.length) {
          const lines: string[] = [];
          const linksHtml: string[] = [];
          for (const slot of timeSlots) {
            const token = await signSlotToken(candidateSelectionId, slot.at);
            const url = `${confirmBaseUrl.replace(/\/$/, "")}/confirm-interview?token=${encodeURIComponent(token)}&selectionId=${encodeURIComponent(candidateSelectionId)}&slot=${encodeURIComponent(slot.at)}`;
            lines.push(`• ${slot.label}: ${url}`);
            linksHtml.push(`<a href="${url}" style="display:inline-block;margin:6px 12px 6px 0;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">${slot.label}</a>`);
          }
          pickTimeSection = `\n\nPick your interview time (click one to confirm):\n${lines.join("\n")}${scheduleOwnText}`;
          pickTimeSectionHtml = `<p style="margin:16px 0 8px 0;"><strong>Pick your interview time (click one to confirm):</strong></p><p>${linksHtml.join(" ")}</p>${scheduleOwnHtml}`;
        } else {
          pickTimeSection = `\n\nSchedule your interview (pick any date & time):\n${scheduleUrl}\n`;
          pickTimeSectionHtml = `<p style="margin:16px 0 8px 0;"><strong>Schedule your interview:</strong></p>${scheduleOwnHtml}`;
        }
      }
      
      emailBody = `Dear ${candidateName},

Congratulations! We are pleased to inform you that you have been selected for the position of ${jobTitle}.

Your application stood out among many candidates, and we believe you would be a great addition to our team.
${interviewDetailsSection}
${pickTimeSection}

We look forward to welcoming you to our team!

Best regards,
HR Team
${companyName || "Our Company"}`;
    }

    const emailPayload: { from: string; to: string; subject: string; text: string; html?: string } = {
      from: "HR Team <onboarding@resend.dev>",
      to: to,
      subject: emailSubject,
      text: emailBody,
    };
    if (emailType === 'selection' && pickTimeSectionHtml) {
      emailPayload.html = [
        `<p>Dear ${candidateName},</p>`,
        `<p>Congratulations! We are pleased to inform you that you have been selected for the position of <strong>${jobTitle}</strong>.</p>`,
        `<p>Your application stood out among many candidates, and we believe you would be a great addition to our team.</p>`,
        interviewDetailsSection ? `<div style="margin:12px 0;">${interviewDetailsSection.replace(/\n/g, "<br>")}</div>` : "",
        pickTimeSectionHtml,
        `<p>We look forward to welcoming you to our team!</p>`,
        `<p>Best regards,<br>HR Team<br>${companyName || "Our Company"}</p>`,
      ].filter(Boolean).join("");
    }

    console.log("[send-selection-email] Sending via Resend to:", to);
    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("[send-selection-email] Resend error:", JSON.stringify(error));
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

    console.log("[send-selection-email] Success, messageId:", data?.id);
    return new Response(
      JSON.stringify({
        success: true,
        messageId: data?.id,
        message: "Email sent successfully",
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
    console.error("[send-selection-email] Exception:", error);
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
