import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const VIDEOSDK_API_KEY = Deno.env.get("VIDEOSDK_API_KEY");
const VIDEOSDK_SECRET = Deno.env.get("VIDEOSDK_SECRET");

async function generateVideoSDKToken(): Promise<string | null> {
  if (!VIDEOSDK_API_KEY || !VIDEOSDK_SECRET) {
    console.error("[import-meeting-transcript] VideoSDK credentials not configured");
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
      .setExpirationTime("60m")
      .sign(secret);
    return token;
  } catch (e) {
    console.error("[import-meeting-transcript] Failed to generate VideoSDK token:", e);
    return null;
  }
}

interface PostTranscription {
  id: string;
  roomId?: string;
  sessionId?: string;
  transcriptionFilePaths?: {
    vtt?: string;
    txt?: string;
  };
}

function parseVtt(vtt: string): { speaker: string | null; message: string }[] {
  const lines = vtt.split(/\r?\n/);
  const results: { speaker: string | null; message: string }[] = [];
  let i = 0;

  // Skip WEBVTT header if present
  if (lines[0]?.trim().toUpperCase().startsWith("WEBVTT")) {
    i++;
  }

  while (i < lines.length) {
    // Skip empty / numeric cue id lines
    while (i < lines.length && !lines[i].includes("-->")) {
      i++;
    }
    if (i >= lines.length) break;

    // Time line at lines[i], next non-empty is text
    i++; // move to potential text
    while (i < lines.length && !lines[i].trim()) {
      i++;
    }
    if (i >= lines.length) break;

    const textLine = lines[i].trim();
    i++;

    let speaker: string | null = null;
    let message = textLine;

    const match = textLine.match(/^\[(.+?)\]:\s*(.*)$/);
    if (match) {
      speaker = match[1];
      message = match[2] || "";
    }

    if (message) {
      results.push({ speaker, message });
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const { roomId } = await req.json().catch(() => ({}));
    if (!roomId || typeof roomId !== "string") {
      return new Response(JSON.stringify({ error: "Missing roomId" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const token = await generateVideoSDKToken();
    if (!token) {
      return new Response(JSON.stringify({ error: "VideoSDK credentials not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Fetch post transcriptions for this room
    const metaRes = await fetch(
      `https://api.videosdk.live/ai/v1/post-transcriptions?roomId=${encodeURIComponent(
        roomId,
      )}&page=1&perPage=1`,
      {
        method: "GET",
        headers: {
          Authorization: token, // per VideoSDK docs: JWT without Bearer prefix
          "Content-Type": "application/json",
        },
      },
    );

    if (!metaRes.ok) {
      const text = await metaRes.text().catch(() => "");
      console.error("[import-meeting-transcript] Failed to fetch metadata:", metaRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to fetch post transcription metadata", status: metaRes.status }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const metaJson = (await metaRes.json().catch(() => null)) as
      | { data?: PostTranscription[]; transcriptions?: PostTranscription[] }
      | PostTranscription[]
      | null;

    let items: PostTranscription[] = [];
    if (Array.isArray(metaJson)) {
      items = metaJson;
    } else if (metaJson) {
      const anyJson = metaJson as any;
      if (Array.isArray(anyJson.transcriptions)) {
        items = anyJson.transcriptions;
      } else if (Array.isArray(anyJson.data)) {
        items = anyJson.data;
      }
    }

    if (!items.length) {
      return new Response(
        JSON.stringify({ error: "No post transcription found for this room", data: metaJson }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const first = items[0];
    const vttUrl = first.transcriptionFilePaths?.vtt;
    if (!vttUrl) {
      return new Response(
        JSON.stringify({ error: "No VTT transcript URL available for this transcription" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // Fetch VTT content
    const vttRes = await fetch(vttUrl);
    if (!vttRes.ok) {
      const text = await vttRes.text().catch(() => "");
      console.error("[import-meeting-transcript] Failed to fetch VTT:", vttRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to fetch VTT transcript", status: vttRes.status }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
    const vttText = await vttRes.text();

    const parsed = parseVtt(vttText);
    console.log(
      "[import-meeting-transcript] Parsed VTT lines:",
      parsed.length,
      "for roomId",
      roomId,
    );

    if (!parsed.length) {
      return new Response(
        JSON.stringify({ error: "VTT transcript contained no lines", url: vttUrl }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // Optionally clear existing lines for this room to avoid duplicates
    await supabase.from("meeting_transcripts").delete().eq("room_id", roomId);

    const insertPayload = parsed.map((p) => ({
      room_id: roomId,
      participant_name: p.speaker,
      speaker_label: p.speaker,
      message: p.message,
      raw: { source: "videosdk-vtt" },
    }));

    const { error: insertError } = await supabase.from("meeting_transcripts").insert(insertPayload);
    if (insertError) {
      console.error("[import-meeting-transcript] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to insert transcript lines", details: insertError.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        roomId,
        lines: parsed.length,
        vttUrl,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (err) {
    console.error("[import-meeting-transcript] Unexpected error:", err);
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

