import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";
import { calculateSellQuoteTRY, grossAssetFromTotalPaid, SELL_FEE_RATE } from "@/lib/sim/realEstatePrice";
import { getTerronSalePricePerM2, type TerronPropertyPricingInput } from "@/lib/propertySalePrice";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Portföy satışı: RLS nedeniyle istemciden `properties` güncellemesi başarısız olabiliyor.
 * Service role ile stok + cüzdan + pozisyon kapatma atomik sırada yapılır.
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

  let body: { positionId?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }
  const positionId = String(body.positionId ?? "").trim();
  if (!positionId) return bad("positionId gerekli", 400);

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pos, error: posErr } = await sb
    .from("positions")
    .select("id,user_id,property_id,m2,total_paid")
    .eq("id", positionId)
    .maybeSingle();

  if (posErr) return bad(posErr.message, 500);
  if (!pos || pos.user_id !== user.id) return bad("Pozisyon bulunamadı", 404);

  const m2 = Number(pos.m2 ?? 0);
  if (!Number.isFinite(m2) || m2 <= 0) return bad("Geçersiz m²", 400);

  const { data: prop, error: pErr } = await sb
    .from("properties")
    .select(
      "id,title,city,price_per_m2,available_m2,sold_m2,total_area_m2,development_score,last_30d_change,quality_score,risk_score,rental_yield_annual,min_buy_m2,total_shares"
    )
    .eq("id", pos.property_id)
    .maybeSingle();

  if (pErr || !prop) return bad("İlan bulunamadı", 404);

  const px = getTerronSalePricePerM2(prop as TerronPropertyPricingInput, user.id);
  if (!Number.isFinite(px) || px <= 0) return bad("Geçersiz satış tutarı", 400);

  const quote = calculateSellQuoteTRY(px, m2);
  const net = Math.round(quote.netProceeds);
  const sellFee = Math.round(quote.sellFee);

  const prevAvail = Number(prop.available_m2 ?? 0);
  const prevSold = Number(prop.sold_m2 ?? 0);
  const nextAvail = prevAvail + m2;
  const nextSold = Math.max(0, prevSold - m2);

  const iso = new Date().toISOString();

  // sold_m2 bazen pozisyonlarla tam senkron olmayabilir; hedef değerleri doğrudan yazar (tek ilan satırı).
  const { data: updatedRows, error: propUpErr } = await sb
    .from("properties")
    .update({
      available_m2: nextAvail,
      sold_m2: nextSold,
      updated_at: iso,
    })
    .eq("id", pos.property_id)
    .select("id");

  if (propUpErr) return bad(propUpErr.message, 500);
  if (!updatedRows?.length) {
    return bad("İlan güncellenemedi (kayıt bulunamadı).", 404);
  }

  const { data: wBefore } = await sb.from("wallets").select("user_id,balance").eq("user_id", user.id).maybeSingle();
  const curBal = wBefore?.balance != null ? Number(wBefore.balance) : 0;
  const nextBal = Math.max(0, curBal + net);

  const { data: wUpRows, error: wUpErr } = await sb
    .from("wallets")
    .update({ balance: nextBal })
    .eq("user_id", user.id)
    .select("user_id");

  if (wUpErr) {
    await sb
      .from("properties")
      .update({ available_m2: prevAvail, sold_m2: prevSold, updated_at: iso })
      .eq("id", pos.property_id);
    return bad(wUpErr.message, 500);
  }

  if (!wUpRows?.length) {
    const { error: wInsErr } = await sb.from("wallets").insert({
      user_id: user.id,
      balance: nextBal,
    });
    if (wInsErr) {
      await sb
        .from("properties")
        .update({ available_m2: prevAvail, sold_m2: prevSold, updated_at: iso })
        .eq("id", pos.property_id);
      return bad(wInsErr.message, 500);
    }
  }

  const { data: revRow, error: revErr } = await sb
    .from("platform_revenue")
    .insert({
      user_id: user.id,
      property_id: pos.property_id,
      type: "sell_fee",
      gross_amount: Math.round(quote.grossSaleValue),
      fee_rate: SELL_FEE_RATE,
      fee_amount: sellFee,
    })
    .select("id")
    .single();

  if (revErr) {
    await sb
      .from("properties")
      .update({ available_m2: prevAvail, sold_m2: prevSold, updated_at: iso })
      .eq("id", pos.property_id);
    await sb.from("wallets").update({ balance: curBal }).eq("user_id", user.id);
    return bad(revErr.message, 500);
  }

  const entryGross = grossAssetFromTotalPaid(Number(pos.total_paid ?? 0));
  const profitTry = Math.round(quote.grossSaleValue - entryGross);
  const profitPct = entryGross > 0 ? (profitTry / entryGross) * 100 : 0;

  const { data: soldSnapRow, error: soldSnapErr } = await sb
    .from("sold_positions")
    .insert({
      user_id: user.id,
      property_id: pos.property_id,
      property_title: prop.title ?? null,
      city: prop.city ?? null,
      m2,
      total_paid: Number(pos.total_paid ?? 0),
      sell_gross: Math.round(quote.grossSaleValue),
      sell_fee: sellFee,
      sell_net: net,
      profit_try: profitTry,
      profit_pct: profitPct,
    })
    .select("id")
    .single();
  // sold_positions henüz migrate edilmemişse (tablo yok) satışı bloklamayız — sadece geçmiş kaydı atlanır.
  if (soldSnapErr) console.warn("[sell] sold_positions insert skipped:", soldSnapErr.message);

  const { error: delErr } = await sb.from("positions").delete().eq("id", positionId).eq("user_id", user.id);
  if (delErr) {
    if (soldSnapRow?.id) await sb.from("sold_positions").delete().eq("id", soldSnapRow.id);
    if (revRow?.id) await sb.from("platform_revenue").delete().eq("id", revRow.id);
    await sb
      .from("properties")
      .update({ available_m2: prevAvail, sold_m2: prevSold, updated_at: iso })
      .eq("id", pos.property_id);
    await sb.from("wallets").update({ balance: curBal }).eq("user_id", user.id);
    return bad(delErr.message, 500);
  }

  return NextResponse.json({
    ok: true,
    netProceeds: net,
    sellFee,
    grossSaleValue: Math.round(quote.grossSaleValue),
  });
}
