import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buyFeeFromTotalPaid } from "@/lib/admin/analytics";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";
import { BUY_FEE_RATE } from "@/lib/sim/realEstatePrice";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Alım sonrası komisyon defteri (service role).
 * total_paid = brüt varlık + alım komisyonu; kullanıcı cüzdandan zaten düşülmüştür.
 */
export async function POST(req: Request) {
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
  if (authErr || !user?.id) return bad("Oturum geçersiz", 401);

  let body: { propertyId?: string; totalPaid?: number; positionId?: string | null };
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }

  const propertyId = String(body.propertyId ?? "").trim();
  const totalPaid = Number(body.totalPaid);
  const positionId = body.positionId ? String(body.positionId).trim() : null;

  if (!propertyId) return bad("propertyId gerekli", 400);
  if (!Number.isFinite(totalPaid) || totalPaid <= 0) return bad("totalPaid geçersiz", 400);

  const fee = Math.round(buyFeeFromTotalPaid(totalPaid));

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: insErr } = await sb.from("platform_revenue").insert({
    user_id: user.id,
    property_id: propertyId,
    position_id: positionId,
    type: "buy_fee",
    gross_amount: Math.round(totalPaid),
    fee_rate: BUY_FEE_RATE,
    fee_amount: fee,
  });

  if (insErr) {
    console.error("[platform/revenue/buy]", insErr);
    return bad(insErr.message, 500);
  }

  return NextResponse.json({ ok: true, buyFee: fee });
}
