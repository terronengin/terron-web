import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { DISPLAY_USER_COUNT_KEY } from "@/lib/site/displayUserCount";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function PATCH(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = getServiceRoleKey();

  if (!supabaseUrl || !anonKey) return bad("Supabase yapılandırması eksik", 500);
  if (!serviceKey) return responseMissingServiceRole();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return bad("Yetki gerekli", 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !user?.email || !isAdminEmail(user.email)) {
    return bad("Bu işlem için yetkiniz yok", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }
  const valueRaw = (body as { value?: unknown })?.value;
  const n = typeof valueRaw === "number" ? valueRaw : Number(valueRaw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 999_999_999) {
    return bad("Geçerli bir tam sayı girin (0–999.999.999)", 400);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await sb.from("site_config").upsert(
    {
      key: DISPLAY_USER_COUNT_KEY,
      value_int: n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, value: n });
}
