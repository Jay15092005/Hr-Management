import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:supabase@^2.56.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const confirmSecret = Deno.env.get("CONFIRM_INTERVIEW_SECRET") || "";

const MIN_LEAD_TIME_MINUTES =
  Number(Deno.env.get("MIN_LEAD_TIME_MINUTES") ?? "10") || 10;
const SELECTION_LINK_TTL_DAYS =
  Number(Deno.env.get("SELECTION_LINK_TTL_DAYS") ?? "2") || 2;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function sendSlotConfirmationEmail(
  selectionId: string,
  scheduledAtLabel: string
): Promise<void> {
  try {
    const { data: sel } = await supabase
      .from("candidate_selections")
      .select("resume_id, job_description_id")
      .eq("id", selectionId)
      .single();
    if (!sel?.resume_id || !sel?.job_description_id) return;
    const [{ data: resume }, { data: job }] = await Promise.all([
      supabase.from("resumes").select("email, name").eq("id", sel.resume_id).single(),
      supabase.from("job_descriptions").select("title").eq("id", sel.job_description_id).single(),
    ]);
    if (!resume?.email || !job?.title) return;
    const url = `${supabaseUrl}/functions/v1/send-selection-email`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        emailType: "slot-confirmed",
        to: resume.email,
        candidateName: resume.name || "Candidate",
        jobTitle: job.title,
        scheduledAtLabel,
      }),
    });
  } catch (e) {
    console.error("[schedule-interview] Failed to send slot confirmation email:", e);
  }
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyScheduleToken(selectionId: string, token: string): Promise<boolean> {
  if (!confirmSecret) return false;
  const message = new TextEncoder().encode(selectionId + "schedule");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(confirmSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message);
  const expected = base64UrlEncode(sig);
  return expected === token;
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
    const { token, selectionId, slot } = await req.json();
    if (!token || !selectionId || !slot) {
      return new Response(
        JSON.stringify({ error: "Missing token, selectionId, or slot" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const scheduledAt = new Date(slot);
    if (isNaN(scheduledAt.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid date or time" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    const now = new Date();

    // Enforce 2-day expiry for schedule links based on selection timestamps
    const { data: selRow, error: selErr } = await supabase
      .from("candidate_selections")
      .select("selected_at, email_sent_at")
      .eq("id", selectionId)
      .single();

    if (selErr || !selRow) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link" }),
        { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const nowMs = now.getTime();
    const twoDaysMs = SELECTION_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;
    const selectedAtMs = selRow.selected_at ? new Date(selRow.selected_at).getTime() : 0;
    const emailSentAtMs = selRow.email_sent_at ? new Date(selRow.email_sent_at).getTime() : 0;
    const refMs = emailSentAtMs || selectedAtMs;
    if (!refMs || nowMs - refMs > twoDaysMs) {
      return new Response(
        JSON.stringify({ error: "This link has expired. Please request a new interview link." }),
        { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const minTime = new Date(now.getTime() + MIN_LEAD_TIME_MINUTES * 60 * 1000);
    if (scheduledAt.getTime() < minTime.getTime()) {
      return new Response(
        JSON.stringify({ error: "Please choose a time at least 10 minutes from now." }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (!(await verifyScheduleToken(selectionId, token))) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link" }),
        { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const { data: existing } = await supabase
      .from("interview_configurations")
      .select("id")
      .eq("candidate_selection_id", selectionId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyScheduled: true,
          scheduledAt: slot,
          message: "An interview was already scheduled for this selection.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const { error: insertErr } = await supabase
      .from("interview_configurations")
      .insert({
        candidate_selection_id: selectionId,
        interview_type: "Technical Interview",
        difficulty_level: "Medium",
        duration_minutes: 60,
        coding_round: false,
        scheduled_at: scheduledAt.toISOString(),
        status: "scheduled",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[schedule-interview] Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to schedule interview", details: insertErr.message }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    await supabase
      .from("candidate_selections")
      .update({ interview_scheduled: true })
      .eq("id", selectionId);

    const scheduledAtLabel = scheduledAt.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });
    await sendSlotConfirmationEmail(selectionId, scheduledAtLabel);

    return new Response(
      JSON.stringify({
        success: true,
        scheduledAt: scheduledAt.toISOString(),
        scheduledAtLabel,
        message: "Your interview has been scheduled.",
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    console.error("[schedule-interview] Exception:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
