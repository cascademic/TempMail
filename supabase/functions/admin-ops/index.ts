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

async function isAdmin(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin, is_approved")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true && data?.is_approved === true;
}

async function getProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

function generateTempPassword(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let result = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
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
  const path = url.pathname.replace(/^\/admin-ops/, "");

  try {
    // ============================================================
    // ADMIN ROUTES (require admin role)
    // ============================================================

    if (path === "/pending-users" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, created_at")
        .eq("is_approved", false)
        .eq("is_admin", false)
        .order("created_at", { ascending: true });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, pendingUsers: data || [] });
    }

    if (path === "/approved-users" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, approved_at, last_login, emails_created, is_admin")
        .eq("is_approved", true)
        .neq("is_admin", true)
        .order("approved_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, approvedUsers: data || [] });
    }

    if (path === "/all-users" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, is_approved, is_admin, created_at, approved_at, last_login, emails_created")
        .order("created_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, users: data || [] });
    }

    if (path === "/approve-user" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const body = await req.json();
      const { userId, approve } = body;
      if (!userId) return json({ error: "userId required" }, 400);

      if (approve) {
        const { data, error } = await supabase
          .from("profiles")
          .update({
            is_approved: true,
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          })
          .eq("id", userId)
          .select("id, username, is_approved")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "User not found" }, 404);
        return json({ success: true, message: "User approved", user: data });
      } else {
        const { data, error } = await supabase
          .from("profiles")
          .update({ is_approved: false, approved_at: null, approved_by: null })
          .eq("id", userId)
          .select("id, username, is_approved")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "User not found" }, 404);
        return json({ success: true, message: "User rejected", user: data });
      }
    }

    if (path === "/reset-password" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const body = await req.json();
      const { userId } = body;
      if (!userId) return json({ error: "userId required" }, 400);

      const profile = await getProfile(userId);
      if (!profile) return json({ error: "User not found" }, 404);

      const tempPassword = generateTempPassword();

      // Get the user's email from auth
      const { data: authUserData, error: listError } = await supabase.auth.admin
        .listUsers();
      if (listError) return json({ error: listError.message }, 500);

      const targetAuthUser = authUserData.users.find((u: any) => u.id === userId);
      if (!targetAuthUser) return json({ error: "Auth user not found" }, 404);

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        { password: tempPassword }
      );
      if (updateError) return json({ error: updateError.message }, 500);

      return json({
        success: true,
        tempPassword,
        message: "Share this temporary password with the user",
        user: { username: profile.username, email: targetAuthUser.email },
      });
    }

    if (path === "/deactivate-user" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const body = await req.json();
      const { userId } = body;
      if (!userId) return json({ error: "userId required" }, 400);

      const { data, error } = await supabase
        .from("profiles")
        .update({ is_approved: false, approved_at: null, approved_by: null })
        .eq("id", userId)
        .neq("is_admin", true)
        .select("id, username")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "User not found or is admin" }, 404);
      return json({ success: true, message: "User deactivated", user: data });
    }

    if (path === "/stats" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const [pendingRes, approvedRes, emailsRes, messagesRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_approved", false).neq("is_admin", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_approved", true).neq("is_admin", true),
        supabase.from("temp_emails").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
      ]);

      return json({
        success: true,
        stats: {
          pendingUsers: pendingRes.count || 0,
          approvedUsers: approvedRes.count || 0,
          totalEmails: emailsRes.count || 0,
          totalMessages: messagesRes.count || 0,
        },
      });
    }

    if (path === "/config" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);

      const body = await req.json();
      const { email_ttl_seconds, max_emails_per_user, service_name, email_domain } = body;

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };
      if (typeof email_ttl_seconds === "number") {
        if (email_ttl_seconds < 60) return json({ error: "email_ttl_seconds must be >= 60" }, 400);
        updates.email_ttl_seconds = email_ttl_seconds;
      }
      if (typeof max_emails_per_user === "number") {
        if (max_emails_per_user < 1) return json({ error: "max_emails_per_user must be >= 1" }, 400);
        updates.max_emails_per_user = max_emails_per_user;
      }
      if (typeof service_name === "string" && service_name.trim()) {
        updates.service_name = service_name.trim();
      }
      if (typeof email_domain === "string" && email_domain.trim()) {
        updates.email_domain = email_domain.trim();
      }

      const { data, error } = await supabase
        .from("app_config")
        .update(updates)
        .eq("id", 1)
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Config not found" }, 404);
      return json({ success: true, config: data });
    }

    // ============================================================
    // PROFILE ROUTES (authenticated user)
    // ============================================================

    if (path === "/profile" && req.method === "GET") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const profile = await getProfile(user.id);
      if (!profile) return json({ error: "Profile not found" }, 404);

      // Get auth user email
      const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
      return json({
        success: true,
        profile: {
          ...profile,
          email: authUser.user?.email || "",
        },
      });
    }

    if (path === "/change-password" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const body = await req.json();
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return json({ error: "New password must be at least 6 characters" }, 400);
      }

      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, message: "Password changed successfully" });
    }

    if (path === "/update-last-login" && req.method === "POST") {
      const user = await getAuthUser(req);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { error } = await supabase
        .from("profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message || "Internal server error" }, 500);
  }
});
