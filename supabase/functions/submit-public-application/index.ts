import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const form = await req.formData();
    const slug = String(form.get("slug") || "").trim();
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const yearsStr = String(form.get("years_of_experience") || "").trim();
    const location = String(form.get("location") || "").trim();
    const degree = String(form.get("degree") || "").trim();
    const file = form.get("resume");

    if (!slug || !name || !email || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const years = yearsStr ? Number(yearsStr) : null;
    const allowedTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ]);
    if (!allowedTypes.has(file.type)) {
      return new Response(JSON.stringify({ error: "Invalid file type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return new Response(JSON.stringify({ error: "File too large" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: link, error: linkError } = await supabase
      .from("job_application_links")
      .select("id, owner_id, job_description_id, is_active, expires_at")
      .eq("slug", slug)
      .single();

    if (linkError || !link) {
      return new Response(JSON.stringify({ error: "Invalid application link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!link.is_active || new Date(link.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Application link expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "pdf";
    const path = `${link.owner_id}/public_form/${link.id}/${Date.now()}_${sanitize(name)}.${sanitize(ext || "pdf")}`;
    const uploadRes = await supabase.storage.from("resumes").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (uploadRes.error) throw uploadRes.error;

    const { data: insertedResume, error: resumeError } = await supabase
      .from("resumes")
      .insert({
        owner_id: link.owner_id,
        name,
        email,
        resume_file_url: null,
        storage_object_path: path,
        resume_file_name: file.name,
        years_of_experience: Number.isFinite(years) ? years : null,
        location: location || null,
        degree: degree || null,
        date_of_application: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (resumeError || !insertedResume) throw resumeError || new Error("Resume insert failed");

    const { error: submissionError } = await supabase
      .from("job_application_submissions")
      .insert({
        link_id: link.id,
        owner_id: link.owner_id,
        resume_id: insertedResume.id,
        candidate_email: email,
      });
    if (submissionError) throw submissionError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
