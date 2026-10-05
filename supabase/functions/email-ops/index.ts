import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function getProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

async function getConfig() {
  const { data } = await supabase
    .from("app_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

function extractOtp(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /(?:OTP|code|verification|PIN|PASS)\s*[:\-]?\s*(\d{4,8})/gi,
    /\b(\d{4,8})\b/g,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = match[0].match(/\d{4,8}/);
      if (digits) return digits[0];
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/email-ops/, "");

  try {
    // ============================================================
    // CREATE TEMP EMAIL
    // ============================================================
    if (path === "/create" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const profile = await getProfile(user.id);
      if (!profile) return json({ error: "Profile not found" }, 404);
      if (!profile.is_approved) return json({ error: "Your account is pending admin approval" }, 403);

      const body = await req.json();
      const { emailLocal } = body;
      if (!emailLocal || !/^[a-zA-Z0-9._-]{3,64}$/.test(emailLocal)) {
        return json({ error: "Invalid email local part (3-64 chars, alphanumeric, dots, hyphens, underscores)" }, 400);
      }

      const config = await getConfig();
      if (!config) return json({ error: "Service configuration not found" }, 500);

      // Check max emails limit
      const { count, error: countError } = await supabase
        .from("temp_emails")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", user.id);
      if (countError) return json({ error: countError.message }, 500);
      if ((count || 0) >= config.max_emails_per_user) {
        return json({ error: `Maximum email limit reached (${config.max_emails_per_user})` }, 400);
      }

      const fullEmail = `${emailLocal.toLowerCase()}@${config.email_domain}`;
      const expiresAt = new Date(Date.now() + config.email_ttl_seconds * 1000).toISOString();

      const { data: existing } = await supabase
        .from("temp_emails")
        .select("id")
        .eq("email", fullEmail)
        .maybeSingle();

      if (existing) return json({ error: "This email address already exists" }, 409);

      const { data, error } = await supabase
        .from("temp_emails")
        .insert({
          email: fullEmail,
          owner_user_id: user.id,
          expires_at: expiresAt,
        })
        .select("*")
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Failed to create email" }, 500);

      // Increment emails_created counter
      await supabase
        .from("profiles")
        .update({ emails_created: (profile.emails_created || 0) + 1 })
        .eq("id", user.id);

      const ttlHours = Math.floor(config.email_ttl_seconds / 3600);
      const ttlMinutes = Math.floor((config.email_ttl_seconds % 3600) / 60);
      let expiresIn = "";
      if (ttlHours > 0) expiresIn = `${ttlHours} hour${ttlHours > 1 ? "s" : ""}`;
      else if (ttlMinutes > 0) expiresIn = `${ttlMinutes} minute${ttlMinutes > 1 ? "s" : ""}`;
      else expiresIn = `${config.email_ttl_seconds} seconds`;

      return json({ success: true, email: data, expiresIn });
    }

    // ============================================================
    // GET INBOX (temp emails for current user)
    // ============================================================
    if (path === "/inbox" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data, error } = await supabase
        .from("temp_emails")
        .select(`
          *,
          messages (
            id,
            "from",
            subject,
            received_at,
            otp
          )
        `)
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const emails = (data || []).map((e: any) => {
        const messages = e.messages || [];
        const latestMessage = messages.length > 0
          ? messages.reduce((latest: any, m: any) =>
              new Date(m.received_at) > new Date(latest.received_at) ? m : latest
            )
          : null;
        return {
          id: e.id,
          email: e.email,
          messageCount: e.message_count,
          createdAt: e.created_at,
          expiresAt: e.expires_at,
          latestMessage: latestMessage
            ? { subject: latestMessage.subject, from: latestMessage.from, receivedAt: latestMessage.received_at }
            : null,
        };
      });

      return json({ success: true, emails });
    }

    // ============================================================
    // GET MESSAGES FOR A TEMP EMAIL
    // ============================================================
    if (path.startsWith("/messages/") && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const tempEmailId = path.split("/")[2];

      // Verify ownership
      const { data: tempEmail } = await supabase
        .from("temp_emails")
        .select("id, email, owner_user_id")
        .eq("id", tempEmailId)
        .maybeSingle();

      if (!tempEmail) return json({ error: "Email not found" }, 404);
      if (tempEmail.owner_user_id !== user.id) return json({ error: "Unauthorized" }, 403);

      const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .eq("temp_email_id", tempEmailId)
        .order("received_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);

      return json({ success: true, email: tempEmail.email, messages: messages || [] });
    }

    // ============================================================
    // GET SINGLE MESSAGE
    // ============================================================
    if (path.startsWith("/message/") && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const parts = path.split("/");
      const tempEmailId = parts[2];
      const messageId = parts[3];

      const { data: tempEmail } = await supabase
        .from("temp_emails")
        .select("id, email, owner_user_id")
        .eq("id", tempEmailId)
        .maybeSingle();

      if (!tempEmail) return json({ error: "Email not found" }, 404);
      if (tempEmail.owner_user_id !== user.id) return json({ error: "Unauthorized" }, 403);

      const { data: message, error } = await supabase
        .from("messages")
        .select("*")
        .eq("id", messageId)
        .eq("temp_email_id", tempEmailId)
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      if (!message) return json({ error: "Message not found" }, 404);

      return json({ success: true, message });
    }

    // ============================================================
    // TEST SEND (for development/testing)
    // ============================================================
    if (path === "/test-send" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const profile = await getProfile(user.id);
      if (!profile || !profile.is_approved) return json({ error: "Not approved" }, 403);

      const body = await req.json();
      const { to, subject, body: bodyText } = body;
      if (!to || !subject || !bodyText) {
        return json({ error: "to, subject, and body are required" }, 400);
      }

      // Find the temp email
      const { data: tempEmail } = await supabase
        .from("temp_emails")
        .select("id, email, owner_user_id, expires_at")
        .eq("email", to.toLowerCase())
        .maybeSingle();

      if (!tempEmail) return json({ error: "Destination email not found" }, 404);
      if (tempEmail.owner_user_id !== user.id) return json({ error: "Unauthorized" }, 403);

      const otp = extractOtp(bodyText);
      const sizeBytes = new TextEncoder().encode(bodyText).length;

      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          temp_email_id: tempEmail.id,
          from: "test-sender@tempmail.local",
          to: tempEmail.email,
          subject,
          body_text: bodyText,
          body_html: `<div style="font-family: sans-serif;"><p>${bodyText.replace(/\n/g, "<br>")}</p></div>`,
          otp,
          size_bytes: sizeBytes,
        });

      if (msgError) return json({ error: msgError.message }, 500);

      // Update message count and extend expiry
      const { data: updated } = await supabase
        .from("temp_emails")
        .update({
          message_count: (await supabase.from("messages").select("id", { count: "exact", head: true }).eq("temp_email_id", tempEmail.id)).count || 0,
        })
        .eq("id", tempEmail.id)
        .select("message_count")
        .maybeSingle();

      return json({ success: true, message: "Test email created", otp });
    }

    // ============================================================
    // INGEST EMAIL (public, for SMTP webhook / external ingestion)
    // ============================================================
    if (path === "/ingest" && req.method === "POST") {
      // This endpoint is called by an SMTP-to-HTTP bridge or external service
      // It uses the service role key for authentication (not user JWT)
      const apiKey = req.headers.get("X-Api-Key");
      const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!apiKey || apiKey !== expectedKey) {
        return json({ error: "Unauthorized" }, 401);
      }

      const body = await req.json();
      const { to, from, subject, text, html } = body;
      if (!to || !from) return json({ error: "to and from are required" }, 400);

      const { data: tempEmail } = await supabase
        .from("temp_emails")
        .select("id, email, expires_at")
        .eq("email", to.toLowerCase())
        .maybeSingle();

      if (!tempEmail) return json({ error: "Email address not found" }, 404);

      const otp = extractOtp(text || "");
      const sizeBytes = new TextEncoder().encode(text || "").length;
      const config = await getConfig();

      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          temp_email_id: tempEmail.id,
          from,
          to: tempEmail.email,
          subject: subject || "",
          body_text: text || "",
          body_html: html || null,
          otp,
          size_bytes: sizeBytes,
        });

      if (msgError) return json({ error: msgError.message }, 500);

      // Update message count and extend expiry
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("temp_email_id", tempEmail.id);

      const newExpiresAt = new Date(Date.now() + (config?.email_ttl_seconds || 3600) * 1000).toISOString();
      await supabase
        .from("temp_emails")
        .update({ message_count: count || 0, expires_at: newExpiresAt })
        .eq("id", tempEmail.id);

      return json({ success: true, message: "Email ingested", otp });
    }

    // ============================================================
    // CLEANUP EXPIRED (called by cron)
    // ============================================================
    if (path === "/cleanup" && req.method === "POST") {
      const apiKey = req.headers.get("X-Api-Key");
      const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!apiKey || apiKey !== expectedKey) {
        return json({ error: "Unauthorized" }, 401);
      }

      const { data, error } = await supabase
        .from("temp_emails")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .select("id");

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, deletedCount: data?.length || 0 });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
