import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^6.8.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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
 * According to VideoSDK docs: https://docs.videosdk.live/api-reference/realtime-communication/create-room
 * Token must be a JWT signed with API key and secret
 */
async function generateVideoSDKToken(): Promise<string | null> {
  if (!VIDEOSDK_API_KEY || !VIDEOSDK_SECRET) {
    console.error("VideoSDK API key or secret not configured");
    return null;
  }

  try {
    // Use jose library for JWT signing in Deno
    const { SignJWT } = await import("npm:jose@5.9.6");
    const secret = new TextEncoder().encode(VIDEOSDK_SECRET);

    const token = await new SignJWT({
      apikey: VIDEOSDK_API_KEY,
      permissions: ["allow_join", "allow_mod"], // Allow joining and moderation
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("120m") // Token valid for 2 hours
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

interface InterviewData {
  id: string;
  candidate_selection_id: string;
  scheduled_at: string;
  interview_type: string;
  difficulty_level: string;
  duration_minutes: number;
  coding_round: boolean;
  room_id: string | null;
  candidate_email: string;
  candidate_name: string;
  job_title: string;
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

    // Get interview ID from request body (called by pg_cron)
    const { interview_id }: { interview_id?: string } = await req.json().catch(() => ({}));

    if (!interview_id) {
      return new Response(
        JSON.stringify({ error: "Missing interview_id" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Fetch interview configuration with candidate and job details
    const { data: interviewConfig, error: configError } = await supabase
      .from("interview_configurations")
      .select(`
        *,
        candidate_selections!inner (
          resumes!inner (
            email,
            name
          ),
          job_descriptions!inner (
            title
          )
        )
      `)
      .eq("id", interview_id)
      .eq("status", "scheduled")
      .eq("join_link_email_sent", false)
      .single();

    if (configError || !interviewConfig) {
      return new Response(
        JSON.stringify({ 
          error: "Interview not found or already processed",
          details: configError?.message 
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

    // Extract nested data
    const candidateSelection = interviewConfig.candidate_selections;
    const resume = candidateSelection.resumes;
    const jobDescription = candidateSelection.job_descriptions;

    const interviewData: InterviewData = {
      id: interviewConfig.id,
      candidate_selection_id: interviewConfig.candidate_selection_id,
      scheduled_at: interviewConfig.scheduled_at,
      interview_type: interviewConfig.interview_type,
      difficulty_level: interviewConfig.difficulty_level,
      duration_minutes: interviewConfig.duration_minutes,
      coding_round: interviewConfig.coding_round,
      room_id: interviewConfig.room_id,
      candidate_email: resume.email,
      candidate_name: resume.name,
      job_title: jobDescription.title,
    };

    // Create room if it doesn't exist yet (5 minutes before interview)
    let roomId = interviewData.room_id;
    if (!roomId) {
      console.log(`Creating VideoSDK room for interview ${interview_id} (5 minutes before start)`);
      
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

      const customRoomId = `interview-${interview_id}`;
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

      roomId = room.roomId;

      // Update database with room ID (but keep status as 'scheduled')
      const { error: roomUpdateError } = await supabase
        .from("interview_configurations")
        .update({
          room_id: roomId,
          room_created_at: new Date().toISOString(),
          // Keep status as 'scheduled' - will be changed to 'active' at T-0
        })
        .eq("id", interview_id);

      if (roomUpdateError) {
        console.error("Error updating room ID:", roomUpdateError);
        // Continue anyway - we have the room ID
      }
    }

    // Generate join link with actual room ID
    const joinLink = `https://api.videosdk.live/meeting/${roomId}`;

    // Format interview date and time
    const scheduledDate = new Date(interviewData.scheduled_at);
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
    const emailSubject = `Your Interview Starts Soon - Join Link`;
    const emailBody = `Dear ${interviewData.candidate_name},

Your interview for the position of ${interviewData.job_title} is scheduled to start in 5 minutes.

Interview Details:
- Date: ${interviewDate}
- Time: ${interviewTime}
- Duration: ${interviewData.duration_minutes} minutes
- Interview Type: ${interviewData.interview_type}
- Difficulty Level: ${interviewData.difficulty_level}
${interviewData.coding_round ? '- Coding Round: Yes' : ''}

Please click the link below to join your interview room:
${joinLink}

⚠️ Important Notes:
- The interview room will become active only at the scheduled start time (${interviewTime})
- You can click the link now, but you will see "Interview not started yet" until ${interviewTime}
- Please join exactly at the scheduled time
- Ensure you have a stable internet connection
- Have your camera and microphone ready
${interviewData.coding_round ? '- Be prepared for a coding assessment' : ''}

We look forward to speaking with you!

Best regards,
HR Team`;

    // Send email using Resend
    const { data, error: emailError } = await resend.emails.send({
      from: "HR Team <onboarding@resend.dev>", // Update this with your verified domain
      to: interviewData.candidate_email,
      subject: emailSubject,
      text: emailBody,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: emailError }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Update interview configuration to mark email as sent
    const { error: updateError } = await supabase
      .from("interview_configurations")
      .update({
        join_link_email_sent: true,
        join_link_sent_at: new Date().toISOString(),
      })
      .eq("id", interview_id);

    if (updateError) {
      console.error("Error updating interview configuration:", updateError);
      // Email was sent, but update failed - log but don't fail
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: data?.id,
        message: "Join link email sent successfully",
        interview_id: interview_id,
        room_id: roomId,
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
