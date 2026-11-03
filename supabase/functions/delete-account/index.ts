import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://dogussyaman.github.io",
  "http://localhost:8081",
  "http://localhost:19006",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") {
    return jsonResponse({ error: "Yalnızca POST desteklenir." }, 405, cors);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Oturum doğrulanamadı. Yeniden giriş yap." }, 401, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Hesap silme servisi yapılandırılmamış." }, 500, cors);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Oturum geçersiz veya süresi dolmuş. Yeniden giriş yap." }, 401, cors);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: cleanupError } = await admin.rpc("delete_account_data_secure", {
    p_user_id: userData.user.id,
  });
  if (cleanupError) {
    const status = cleanupError.message.includes("Aktif oyunlardan ayrılmadan") ? 409 : 500;
    return jsonResponse({ error: cleanupError.message }, status, cors);
  }

  const { data: avatarFiles, error: listError } = await admin.storage
    .from("avatars")
    .list(userData.user.id, { limit: 100 });
  if (listError) {
    return jsonResponse({ error: "Profil fotoğrafları silinemedi. Yeniden dene." }, 500, cors);
  }

  const avatarPaths = (avatarFiles ?? [])
    .filter((file) => file.name)
    .map((file) => userData.user.id + "/" + file.name);
  if (avatarPaths.length > 0) {
    const { error: removeError } = await admin.storage.from("avatars").remove(avatarPaths);
    if (removeError) {
      return jsonResponse({ error: "Profil fotoğrafları silinemedi. Yeniden dene." }, 500, cors);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return jsonResponse({ error: "Hesap silinemedi. İşlem güvenli biçimde tamamlanmadı; yeniden dene." }, 500, cors);
  }

  return jsonResponse({ success: true }, 200, cors);
});
