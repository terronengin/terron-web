import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function isPlausibleIban(v: string): boolean {
  const s = v.replace(/\s+/g, "").toUpperCase();
  return /^TR[0-9]{24}$|^[A-Z]{2}[0-9A-Z]{13,32}$/.test(s);
}

/**
 * Para çekme talebi — gerçek banka transferi bu API üzerinden yapılmaz.
 * Tutar bakiyeden düşülür ve talep "pending" olarak kaydedilir; admin manuel işler.
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

  let body: { amount?: number; iban?: string; accountHolderName?: string; bankName?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }

  const amount = Math.round(Number(body.amount ?? 0));
  const iban = String(body.iban ?? "").trim();
  const accountHolderName = String(body.accountHolderName ?? "").trim();
  const bankName = String(body.bankName ?? "").trim();

  if (!Number.isFinite(amount) || amount <= 0) return bad("Geçersiz tutar", 400);
  if (!bankName) return bad("Banka adı gerekli", 400);
  if (!accountHolderName) return bad("Hesap sahibi adı gerekli", 400);
  if (!isPlausibleIban(iban)) return bad("Geçersiz IBAN formatı", 400);

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: w, error: wErr } = await sb
    .from("wallets")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();
  if (wErr) return bad(wErr.message, 500);
  const curBal = w?.balance != null ? Number(w.balance) : 0;
  if (amount > curBal) return bad("Yetersiz bakiye", 400);

  const nextBal = curBal - amount;
  const { error: upErr } = await sb.from("wallets").update({ balance: nextBal }).eq("user_id", user.id);
  if (upErr) return bad(upErr.message, 500);

  const { error: reqErr } = await sb.from("withdrawal_requests").insert({
    user_id: user.id,
    amount,
    bank_name: bankName,
    account_holder_name: accountHolderName,
    iban: iban.replace(/\s+/g, "").toUpperCase(),
  });
  if (reqErr) {
    await sb.from("wallets").update({ balance: curBal }).eq("user_id", user.id);
    return bad(reqErr.message, 500);
  }

  return NextResponse.json({ ok: true, balance: nextBal });
}
