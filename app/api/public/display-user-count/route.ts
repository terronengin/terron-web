import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_DISPLAY_USER_COUNT,
  DISPLAY_USER_COUNT_KEY,
} from "@/lib/site/displayUserCount";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getServiceRoleKey();
  if (!supabaseUrl) return bad("Supabase yapılandırması eksik", 500);
  if (!serviceKey) return responseMissingServiceRole();

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from("site_config")
    .select("value_int")
    .eq("key", DISPLAY_USER_COUNT_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({
      ok: true,
      value: DEFAULT_DISPLAY_USER_COUNT,
      fallback: true,
    });
  }

  const raw = data?.value_int;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ ok: true, value: DEFAULT_DISPLAY_USER_COUNT, fallback: true });
  }

  return NextResponse.json({ ok: true, value: Math.min(999_999_999, Math.floor(n)) });
}
