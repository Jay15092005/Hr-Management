import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^6.8.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const resendFrom = Deno.env.get("RESEND_FROM") || "HR Team <onboarding@resend.dev>";

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// VideoSDK API configuration
const VIDEOSDK_API_KEY = Deno.env.get("VIDEOSDK_API_KEY");
const VIDEOSDK_SECRET = Deno.env.get("VIDEOSDK_SECRET");
const VIDEOSDK_API_BASE = "https://api.videosdk.live/v2";

interface VideoSDKRoom {
  roomId: string;
  customRoomId?: string;
  userId: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  id: string;
  links: {
    get_room: string;
    get_session: string;
  };
}

/**
 * Generate VideoSDK JWT token
 */
async function generateVideoSDKToken(): Promise<string | null> {
  if (!VIDEOSDK_API_KEY || !VIDEOSDK_SECRET) {
    console.error("VideoSDK API key or secret not configured");
    return null;
  }

  try {
    const { SignJWT } = await import("npm:jose@5.9.6");
    const secret = new TextEncoder().encode(VIDEOSDK_SECRET);

    const token = await new SignJWT({
      apikey: VIDEOSDK_API_KEY,
      permissions: ["allow_join", "allow_mod"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("120m")
      .sign(secret);

    return token;
  } catch (error) {
    console.error("Error generating VideoSDK JWT token:", error);
    return null;
  }
}

/**
 * Create a VideoSDK room
 */
async function createVideoSDKRoom(
  token: string,
  customRoomId?: string
): Promise<VideoSDKRoom | null> {
  try {
    const response = await fetch(`${VIDEOSDK_API_BASE}/rooms`, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customRoomId: customRoomId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error("Failed to create VideoSDK room:", error);
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data: VideoSDKRoom = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating VideoSDK room:", error);
    return null;
  }
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
    // Check if required credentials are configured
    if (!VIDEOSDK_API_KEY || !VIDEOSDK_SECRET) {
      return new Response(
        JSON.stringify({ error: "VideoSDK API credentials not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

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

    // Get request body
    const {
      candidate_selection_id,
      interview_type,
      difficulty_level,
      duration_minutes,
      coding_round,
    }: {
      candidate_selection_id?: string;
      interview_type?: string;
      difficulty_level?: string;
      duration_minutes?: number;
      coding_round?: boolean;
    } = await req.json().catch(() => ({}));

    if (!candidate_selection_id || !interview_type || !difficulty_level || !duration_minutes) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Fetch candidate selection with candidate and job details
    const { data: candidateSelection, error: selectionError } = await supabase
      .from("candidate_selections")
      .select(`
        *,
        resumes!inner (
          email,
          name
        ),
        job_descriptions!inner (
          title
        )
      `)
      .eq("id", candidate_selection_id)
      .eq("status", "selected")
      .single();

    if (selectionError || !candidateSelection) {
      return new Response(
        JSON.stringify({
          error: "Candidate selection not found or not selected",
          details: selectionError?.message,
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const resume = candidateSelection.resumes;
    const jobDescription = candidateSelection.job_descriptions;

    // Create interview configuration with current time (instant interview)
    const scheduledAt = new Date().toISOString();
    const { data: interviewConfig, error: configError } = await supabase
      .from("interview_configurations")
      .insert({
        candidate_selection_id: candidate_selection_id,
        interview_type: interview_type,
        difficulty_level: difficulty_level,
        duration_minutes: duration_minutes,
        coding_round: coding_round || false,
        scheduled_at: scheduledAt,
        status: "scheduled", // Set to scheduled so AI agent can pick it up
      })
      .select()
      .single();

    if (configError) {
      console.error("Error creating interview configuration:", configError);
      return new Response(
        JSON.stringify({
          error: "Failed to create interview configuration",
          details: configError.message,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Generate VideoSDK token and create room
    const token = await generateVideoSDKToken();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Failed to generate VideoSDK token" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const customRoomId = `interview-${interviewConfig.id}`;
    const room = await createVideoSDKRoom(token, customRoomId);

    if (!room) {
      return new Response(
        JSON.stringify({ error: "Failed to create VideoSDK room" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Update interview configuration with room ID
    const { error: roomUpdateError } = await supabase
      .from("interview_configurations")
      .update({
        room_id: room.roomId,
        room_created_at: new Date().toISOString(),
      })
      .eq("id", interviewConfig.id);

    if (roomUpdateError) {
      console.error("Error updating room ID:", roomUpdateError);
    }

    // Update candidate_selections to mark interview as scheduled
    const { error: updateError } = await supabase
      .from("candidate_selections")
      .update({ interview_scheduled: true })
      .eq("id", candidate_selection_id);

    if (updateError) {
      console.error("Error updating candidate selection:", updateError);
    }

    // Generate join link - use application URL instead of VideoSDK API URL
    // VideoSDK meetings are joined through the application, not directly via API
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
    const joinLink = `${appUrl}/interview/${room.roomId}`;

    // Format interview date and time
    const scheduledDate = new Date(scheduledAt);
    const interviewDate = scheduledDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const interviewTime = scheduledDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Generate email content
    const emailSubject = `Instant Interview - Join Now`;
    const emailBody = `Dear ${resume.name},

You have been invited to an instant interview for the position of ${jobDescription.title}.

Interview Details:
- Date: ${interviewDate}
- Time: ${interviewTime}
- Duration: ${duration_minutes} minutes
- Interview Type: ${interview_type}
- Difficulty Level: ${difficulty_level}
${coding_round ? '- Coding Round: Yes' : ''}

Please click the link below to join your interview room immediately:
${joinLink}

⚠️ Important Notes:
- This is an instant interview - please join as soon as possible
- The interview room is active now
- Ensure you have a stable internet connection
- Have your camera and microphone ready
${coding_round ? '- Be prepared for a coding assessment' : ''}

We look forward to speaking with you!

Best regards,
HR Team`;

    // Send email using Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: resendFrom,
      to: resume.email,
      subject: emailSubject,
      text: emailBody,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      // Don't fail the request if email fails - room is created
    }

    // Update interview configuration to mark email as sent
    if (!emailError) {
      const { error: emailUpdateError } = await supabase
        .from("interview_configurations")
        .update({
          join_link_email_sent: true,
          join_link_sent_at: new Date().toISOString(),
        })
        .eq("id", interviewConfig.id);

      if (emailUpdateError) {
        console.error("Error updating email status:", emailUpdateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Instant interview created successfully",
        interview_id: interviewConfig.id,
        room_id: room.roomId,
        join_url: joinLink,
        email_sent: !emailError,
        message_id: emailData?.id,
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
