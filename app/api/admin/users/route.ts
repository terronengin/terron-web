import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import type { AdminUserRow } from "@/lib/admin/adminUsers";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/** Kayıtlı kullanıcılar: Supabase Auth listesi + `wallets`. Ad/e-posta/şehir `user_metadata` + Auth e-postası (public.profiles sütunlarına bağlı değil). */
export async function GET(req: Request) {
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

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authUserIds: string[] = [];
  const metaNameById = new Map<string, string | null>();
  const metaCityById = new Map<string, string | null>();
  const metaDistrictById = new Map<string, string | null>();
  const emailByAuthId = new Map<string, string | null>();

  for (let page = 1; page <= 100; page++) {
    const { data: pageData, error: listErr } = await sb.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listErr) {
      return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
    }
    const batch = pageData.users;
    for (const u of batch) {
      authUserIds.push(u.id);
      emailByAuthId.set(u.id, u.email ?? null);
      const meta = u.user_metadata as Record<string, unknown> | undefined;
      const fn =
        meta && typeof meta.full_name === "string"
          ? meta.full_name
          : meta && typeof meta.name === "string"
            ? meta.name
            : null;
      metaNameById.set(u.id, fn);
      metaCityById.set(
        u.id,
        meta && typeof meta.city === "string" ? meta.city : null
      );
      metaDistrictById.set(
        u.id,
        meta && typeof meta.district === "string" ? meta.district : null
      );
    }
    if (batch.length < 1000) break;
  }

  const balanceByUser = new Map<string, number>();
  const chunk = 200;
  for (let i = 0; i < authUserIds.length; i += chunk) {
    const slice = authUserIds.slice(i, i + chunk);
    const { data: wallets, error: wErr } = await sb
      .from("wallets")
      .select("user_id,balance")
      .in("user_id", slice);
    if (wErr) {
      return NextResponse.json({ ok: false, error: wErr.message }, { status: 500 });
    }
    for (const w of wallets ?? []) {
      const uid = String((w as { user_id: string }).user_id);
      const b = Number((w as { balance: number | null }).balance ?? 0);
      balanceByUser.set(uid, Number.isFinite(b) ? b : 0);
    }
  }

  const users: AdminUserRow[] = authUserIds.map((id) => ({
    id,
    email: emailByAuthId.get(id) ?? null,
    full_name: metaNameById.get(id) ?? null,
    city: metaCityById.get(id) ?? null,
    district: metaDistrictById.get(id) ?? null,
    balance: balanceByUser.get(id) ?? 0,
  }));

  users.sort((a, b) => {
    const ea = (a.email ?? "").toLowerCase();
    const eb = (b.email ?? "").toLowerCase();
    if (ea && eb) return ea.localeCompare(eb, "tr");
    if (ea) return -1;
    if (eb) return 1;
    return a.id.localeCompare(b.id);
  });

  return NextResponse.json({ ok: true, users });
}
