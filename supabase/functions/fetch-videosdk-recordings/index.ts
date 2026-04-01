import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VIDEOSDK_API_KEY = Deno.env.get("VIDEOSDK_API_KEY");
const VIDEOSDK_SECRET = Deno.env.get("VIDEOSDK_SECRET");
const VIDEOSDK_API_BASE = "https://api.videosdk.live/v2";

async function generateVideoSDKToken(): Promise<string | null> {
  if (!VIDEOSDK_API_KEY || !VIDEOSDK_SECRET) {
    console.error("[fetch-videosdk-recordings] VideoSDK credentials not configured");
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
    console.error("[fetch-videosdk-recordings] Failed to generate token:", e);
    return null;
  }
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      recordingId?: string;
      roomId?: string;
      sessionId?: string;
      page?: number;
      perPage?: number;
    };

    const token = await generateVideoSDKToken();
    if (!token) {
      return new Response(JSON.stringify({ error: "VideoSDK credentials not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const headers = {
      Authorization: token,
      "Content-Type": "application/json",
    };

    // Fetch single recording by id — https://docs.videosdk.live/api-reference/realtime-communication/fetch-recording-using-recordingId
    if (body.recordingId && typeof body.recordingId === "string") {
      const url = `${VIDEOSDK_API_BASE}/recordings/${encodeURIComponent(body.recordingId)}`;
      const res = await fetch(url, { method: "GET", headers });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      if (!res.ok) {
        console.error("[fetch-videosdk-recordings] single recording:", res.status, text);
        return new Response(
          JSON.stringify({
            error: "Failed to fetch recording from VideoSDK",
            status: res.status,
            details: json,
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          },
        );
      }
      return new Response(
        JSON.stringify({ success: true, mode: "recording" as const, recording: json }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        },
      );
    }

    // List by room — https://docs.videosdk.live/api-reference/realtime-communication/fetch-recordings
    const roomId = body.roomId;
    if (!roomId || typeof roomId !== "string") {
      return new Response(JSON.stringify({ error: "Missing roomId or recordingId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const page = Math.max(1, Number(body.page) || 1);
    const perPage = Math.min(50, Math.max(1, Number(body.perPage) || 20));
    const params = new URLSearchParams({
      roomId,
      page: String(page),
      perPage: String(perPage),
    });
    if (body.sessionId && typeof body.sessionId === "string") {
      params.set("sessionId", body.sessionId);
    }

    const listUrl = `${VIDEOSDK_API_BASE}/recordings?${params.toString()}`;
    const listRes = await fetch(listUrl, { method: "GET", headers });
    const listText = await listRes.text();
    let listJson: { pageInfo?: unknown; data?: unknown[] } | null = null;
    try {
      listJson = JSON.parse(listText) as { pageInfo?: unknown; data?: unknown[] };
    } catch {
      /* empty */
    }

    if (!listRes.ok) {
      console.error("[fetch-videosdk-recordings] list:", listRes.status, listText);
      return new Response(
        JSON.stringify({
          error: "Failed to list recordings from VideoSDK",
          status: listRes.status,
          details: listJson ?? listText,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        },
      );
    }

    const recordings = Array.isArray(listJson?.data) ? listJson!.data : [];

    return new Response(
      JSON.stringify({
        success: true,
        mode: "list" as const,
        pageInfo: listJson?.pageInfo ?? null,
        recordings,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      },
    );
  } catch (err) {
    console.error("[fetch-videosdk-recordings] Unexpected:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
