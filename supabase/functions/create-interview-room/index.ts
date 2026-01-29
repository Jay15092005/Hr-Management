import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    // Check if VideoSDK credentials are configured
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

    // Fetch interview configuration
    // Note: Room may already exist (created 5 minutes before), we just need to activate it
    const { data: interviewConfig, error: configError } = await supabase
      .from("interview_configurations")
      .select("*")
      .eq("id", interview_id)
      .eq("status", "scheduled")
      .single();

    if (configError || !interviewConfig) {
      return new Response(
        JSON.stringify({
          error: "Interview not found or already processed",
          details: configError?.message,
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

    // Check if room already exists (created 5 minutes before)
    let roomId = interviewConfig.room_id;

    // If room doesn't exist, create it now (fallback - should rarely happen)
    if (!roomId) {
      console.log(`Room not found, creating now for interview ${interview_id}`);
      
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

      // Update with room ID
      const { error: roomUpdateError } = await supabase
        .from("interview_configurations")
        .update({
          room_id: roomId,
          room_created_at: new Date().toISOString(),
        })
        .eq("id", interview_id);

      if (roomUpdateError) {
        console.error("Error updating room ID:", roomUpdateError);
      }
    }

    // Update interview configuration: Set status to active (room already exists)
    const { error: updateError } = await supabase
      .from("interview_configurations")
      .update({
        status: "active",
      })
      .eq("id", interview_id);

    if (updateError) {
      console.error("Error updating interview configuration:", updateError);
      return new Response(
        JSON.stringify({
          error: "Room created but failed to update database",
          details: updateError.message,
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

    // Generate join link - use application URL instead of VideoSDK API URL
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";
    const joinUrl = `${appUrl}/interview/${roomId}`;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Interview room activated successfully",
        interview_id: interview_id,
        room_id: roomId,
        join_url: joinUrl,
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
