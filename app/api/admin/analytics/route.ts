import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { buyFeeFromTotalPaid, type AdminAnalyticsPayload, type AdminAnalyticsDailyRow } from "@/lib/admin/analytics";
import { SELL_FEE_RATE } from "@/lib/sim/realEstatePrice";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) return bad("Supabase yapılandırması eksik", 500);
  if (!serviceKey) return bad("SUPABASE_SERVICE_ROLE_KEY tanımlı değil", 500);

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

  try {
    const { data: props, error: pErr } = await sb
      .from("properties")
      .select("total_area_m2,available_m2,sold_m2,price_per_m2")
      .limit(50000);
    if (pErr) throw pErr;

    const { data: posRows, error: posErr } = await sb
      .from("positions")
      .select("id,user_id,total_paid,created_at,m2")
      .limit(50000);
    if (posErr) throw posErr;

    const { data: wallRows, error: wErr } = await sb.from("wallets").select("user_id,balance").limit(50000);
    if (wErr) throw wErr;

    const { data: revRows, error: revErr } = await sb
      .from("platform_revenue")
      .select("type,gross_amount,fee_amount,created_at")
      .limit(200000);
    if (revErr) throw revErr;

    const rows = (props ?? []) as {
      total_area_m2: number | null;
      available_m2: number | null;
      sold_m2: number | null;
      price_per_m2: number | null;
    }[];

    let totalAreaM2 = 0;
    let listValueAtPrice = 0;
    let availableM2 = 0;
    let soldM2 = 0;
    let availableValueAtPrice = 0;
    let soldValueAtPrice = 0;

    for (const r of rows) {
      const ta = Number(r.total_area_m2 ?? 0);
      const av = Number(r.available_m2 ?? 0);
      const sd = Number(r.sold_m2 ?? 0);
      const px = Number(r.price_per_m2 ?? 0);
      if (Number.isFinite(ta) && ta > 0) totalAreaM2 += ta;
      if (Number.isFinite(px) && px > 0) {
        if (Number.isFinite(ta) && ta > 0) listValueAtPrice += ta * px;
        if (Number.isFinite(av) && av > 0) availableValueAtPrice += av * px;
        if (Number.isFinite(sd) && sd > 0) soldValueAtPrice += sd * px;
      }
      if (Number.isFinite(av) && av > 0) availableM2 += av;
      if (Number.isFinite(sd) && sd > 0) soldM2 += sd;
    }

    const positions = (posRows ?? []) as {
      id: string;
      user_id: string;
      total_paid: number | null;
      created_at: string;
      m2: number | null;
    }[];

    let totalPaidVolume = 0;
    let estimatedBuyFeesFromPositions = 0;
    const investors = new Set<string>();
    const dayMap = new Map<string, { buyFee: number; volumePaid: number; positionOpens: number }>();

    for (const p of positions) {
      const tp = Number(p.total_paid ?? 0);
      const m2 = Number(p.m2 ?? 0);
      if (p.user_id) investors.add(p.user_id);
      if (Number.isFinite(tp) && tp > 0) {
        totalPaidVolume += tp;
        const bf = buyFeeFromTotalPaid(tp);
        estimatedBuyFeesFromPositions += bf;
        const day = String(p.created_at || "").slice(0, 10) || "1970-01-01";
        const cur = dayMap.get(day) ?? { buyFee: 0, volumePaid: 0, positionOpens: 0 };
        cur.buyFee += bf;
        cur.volumePaid += tp;
        cur.positionOpens += 1;
        dayMap.set(day, cur);
      } else if (Number.isFinite(m2) && m2 > 0) {
        const day = String(p.created_at || "").slice(0, 10) || "1970-01-01";
        const cur = dayMap.get(day) ?? { buyFee: 0, volumePaid: 0, positionOpens: 0 };
        cur.positionOpens += 1;
        dayMap.set(day, cur);
      }
    }

    const estimatedSellFeesFromSoldM2 = Number.isFinite(soldValueAtPrice) ? soldValueAtPrice * SELL_FEE_RATE : 0;
    const totalEstimatedTerronTreasury = estimatedBuyFeesFromPositions + estimatedSellFeesFromSoldM2;

    const wallets = (wallRows ?? []) as { user_id: string; balance: number | null }[];
    let totalUserBalances = 0;
    for (const w of wallets) {
      const b = Number(w.balance ?? 0);
      if (Number.isFinite(b)) totalUserBalances += b;
    }

    const allDates = new Set<string>([...dayMap.keys(), ...ledgerDayMap.keys()]);
    const daily: AdminAnalyticsDailyRow[] = [...allDates]
      .map((date) => {
        const p = dayMap.get(date);
        const L = ledgerDayMap.get(date);
        return {
          date,
          buyFee: Math.round(L?.buyFee ?? p?.buyFee ?? 0),
          sellFee: Math.round(L?.sellFee ?? 0),
          buyVolume: Math.round(L?.buyVol ?? p?.volumePaid ?? 0),
          sellVolume: Math.round(L?.sellVol ?? 0),
          volumePaid: Math.round(p?.volumePaid ?? L?.buyVol ?? 0),
          positionOpens: p?.positionOpens ?? 0,
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 120);

    const payload: AdminAnalyticsPayload = {
      generatedAt: new Date().toISOString(),
      properties: {
        listingCount: rows.length,
        totalAreaM2: Math.round(totalAreaM2),
        listValueAtPrice: Math.round(listValueAtPrice),
        availableM2: Math.round(availableM2),
        soldM2: Math.round(soldM2),
        availableValueAtPrice: Math.round(availableValueAtPrice),
        soldValueAtPrice: Math.round(soldValueAtPrice),
      },
      positions: {
        openCount: positions.length,
        uniqueInvestors: investors.size,
        totalPaidVolume: Math.round(totalPaidVolume),
        estimatedBuyFees: Math.round(estimatedBuyFeesFromPositions),
      },
      fees: {
        ledgerBuyFees: Math.round(ledgerBuyFees),
        ledgerSellFees: Math.round(ledgerSellFees),
        ledgerTotalFees: Math.round(ledgerBuyFees + ledgerSellFees),
        ledgerBuyVolume: Math.round(ledgerBuyVolume),
        ledgerSellVolume: Math.round(ledgerSellVolume),
        estimatedBuyFeesFromPositions: Math.round(estimatedBuyFeesFromPositions),
        estimatedSellFeesFromSoldM2: Math.round(estimatedSellFeesFromSoldM2),
        totalEstimatedTerronTreasury: Math.round(totalEstimatedTerronTreasury),
      },
      wallets: {
        walletRows: wallets.length,
        totalUserBalances: Math.round(totalUserBalances),
      },
      daily,
    };

    return NextResponse.json({ ok: true, ...payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analitik yüklenemedi";
    console.error("[admin/analytics]", e);
    return bad(msg, 500);
  }
}
