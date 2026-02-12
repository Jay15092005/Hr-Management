import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TranscriptPayload {
  roomId: string;
  sessionId?: string;
  participantId?: string;
  participantName?: string;
  text: string;
  timestamp?: string | number;
  type?: string;
  speakerType?: "ai" | "interviewer" | "candidate";
}

function guessSpeakerLabel(payload: TranscriptPayload): string {
  if (payload.speakerType === "ai") return "AI Agent";
  if (payload.speakerType === "interviewer") return "Interviewer";
  if (payload.speakerType === "candidate") return "Candidate";

  const name = (payload.participantName || "").toLowerCase();
  if (name.includes("agent")) return "AI Agent";
  if (name.includes("bot")) return "AI Agent";
  if (name.includes("hr")) return "Interviewer";

  // Fallback to participant name or generic label
  return payload.participantName || "Participant";
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    console.log("[save-meeting-transcript] OPTIONS preflight");
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    console.warn("[save-meeting-transcript] Invalid method:", req.method);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<TranscriptPayload>;
    console.log("[save-meeting-transcript] Incoming body:", body);

    const roomId = body.roomId;
    const text = body.text;

    if (!roomId || !text || typeof text !== "string" || !text.trim()) {
      console.warn("[save-meeting-transcript] Missing roomId or text. roomId:", roomId, "text length:", typeof text === "string" ? text.length : "n/a");
      return new Response(
        JSON.stringify({ error: "Missing or invalid roomId or text" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const payload: TranscriptPayload = {
      roomId,
      text: text.trim(),
      sessionId: body.sessionId,
      participantId: body.participantId,
      participantName: body.participantName,
      timestamp: body.timestamp,
      type: body.type,
      speakerType: body.speakerType,
    };

    const speakerLabel = guessSpeakerLabel(payload);
    console.log("[save-meeting-transcript] Computed speaker label:", speakerLabel);

    // Convert timestamp (if provided) to timestamptz
    let at: string | undefined;
    if (payload.timestamp != null) {
      if (typeof payload.timestamp === "number") {
        at = new Date(payload.timestamp).toISOString();
      } else if (typeof payload.timestamp === "string") {
        const d = new Date(payload.timestamp);
        if (!isNaN(d.getTime())) {
          at = d.toISOString();
        }
      }
    }

    const { error } = await supabase.from("meeting_transcripts").insert({
      room_id: payload.roomId,
      session_id: payload.sessionId ?? null,
      participant_id: payload.participantId ?? null,
      participant_name: payload.participantName ?? null,
      speaker_label: speakerLabel,
      message: payload.text,
      at: at ?? new Date().toISOString(),
      raw: payload as unknown as Record<string, unknown>,
    });

    if (error) {
      console.error("[save-meeting-transcript] Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save transcript line", details: error.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    console.log("[save-meeting-transcript] Insert success");
    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    console.error("[save-meeting-transcript] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

