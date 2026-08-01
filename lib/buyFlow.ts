import { supabase } from "./supabaseClient";
import { calculateSimpleBuyQuoteTRY, calculateSimpleBuyQuoteFromGrossTRY } from "./sim/realEstatePrice";
import { getTerronSalePricePerM2 } from "./propertySalePrice";
import type { PropertyRow } from "./terron/propertyRow";

function getPropertyAvailableM2(p: PropertyRow): number {
  const total = Number(p.total_area_m2 ?? 0);
  const available = p.available_m2 != null ? Number(p.available_m2) : Math.max(0, total - Number(p.sold_m2 ?? 0));
  return Math.max(0, available);
}

function getPropertySoldM2(p: PropertyRow): number {
  const total = Number(p.total_area_m2 ?? 0);
  if (p.sold_m2 != null) return Math.max(0, Number(p.sold_m2));
  return Math.max(0, total - getPropertyAvailableM2(p));
}

export type BuyQuoteInput = { property: PropertyRow; m2: number; budgetGross: number; userId: string };

/** Dashboard'daki getActiveBuyQuoteForAction ile birebir aynı mantık: brüt TL girilmişse brüt tabanlı, değilse m² tabanlı teklif. */
export function getActiveBuyQuote({ property, m2, budgetGross, userId }: BuyQuoteInput) {
  const salePx = getTerronSalePricePerM2(property, userId);
  const totalParcel = Math.max(1, Number(property.total_area_m2 ?? 1));
  const gb = Math.round(budgetGross);
  if (gb > 0) {
    const quote = calculateSimpleBuyQuoteFromGrossTRY(salePx, gb, { totalParcelM2: totalParcel });
    return { quote, effectiveM2: Number(quote.impliedM2 ?? 0) };
  }
  const rawM2 = Math.max(0, Number(m2) || 0);
  const quote = calculateSimpleBuyQuoteTRY(salePx, rawM2, { totalParcelM2: totalParcel });
  return { quote, effectiveM2: rawM2 };
}

export type BuyResult =
  | { ok: true; m2: number; totalPaid: number; newBalance: number; positionId: string }
  | { ok: false; error: string };

/**
 * Tek bir arsa için doğrudan (sepetsiz) satın alma — Dashboard'daki handleOpenPosition ile
 * aynı DB adımlarını (stok düş, cüzdan düş, positions ekle, gelir kaydı) izler, ama Market'in
 * kendi sayfasından, Dashboard'a hiç gitmeden çağrılabilecek bağımsız bir fonksiyon olarak.
 */
export async function executePropertyBuy({
  property,
  m2,
  budgetGross,
  userId,
}: BuyQuoteInput): Promise<BuyResult> {
  const { quote, effectiveM2 } = getActiveBuyQuote({ property, m2, budgetGross, userId });
  if (!Number.isFinite(effectiveM2) || effectiveM2 <= 0) {
    return { ok: false, error: "m² miktarı geçersiz." };
  }

  const available = getPropertyAvailableM2(property);
  const minBuy = Math.max(1, Number(property.min_buy_m2 ?? 1));
  const maxBuy = Number(property.max_buy_m2 ?? available);
  if (effectiveM2 < minBuy) return { ok: false, error: `Minimum alım ${minBuy.toLocaleString("tr-TR")} m²` };
  if (effectiveM2 > available)
    return { ok: false, error: `Bu arsada sadece ${available.toLocaleString("tr-TR")} m² kaldı.` };
  if (Number.isFinite(maxBuy) && effectiveM2 > maxBuy)
    return { ok: false, error: `Bu arsa için tek seferde maksimum ${maxBuy.toLocaleString("tr-TR")} m² alabilirsiniz.` };

  const entryPriceM2 = quote.salePricePerM2;
  const totalPaid = quote.totalCost;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return { ok: false, error: "Giriş yapılmamış görünüyor. Tekrar giriş yapın." };

  const { data: w, error: wErr } = await supabase
    .from("wallets")
    .select("user_id,balance")
    .eq("user_id", user.id)
    .maybeSingle();
  if (wErr) return { ok: false, error: "Cüzdan okunamadı: " + wErr.message };

  let balance = w?.balance != null ? Number(w.balance) : null;
  if (balance == null) {
    const { data: ins, error: insErr } = await supabase
      .from("wallets")
      .insert({ user_id: user.id, balance: 1000000 })
      .select("balance")
      .single();
    if (insErr) return { ok: false, error: "Cüzdan oluşturulamadı: " + insErr.message };
    balance = Number(ins.balance);
  }
  if (balance < totalPaid) {
    return { ok: false, error: `Yetersiz bakiye. Bakiye: ₺${Math.round(balance).toLocaleString("tr-TR")}` };
  }

  const nextAvailable = Math.max(0, available - effectiveM2);
  const nextSold = getPropertySoldM2(property) + effectiveM2;
  const { error: propErr } = await supabase
    .from("properties")
    .update({ available_m2: nextAvailable, sold_m2: nextSold, updated_at: new Date().toISOString() })
    .eq("id", property.id)
    .gte("available_m2", effectiveM2);
  if (propErr) return { ok: false, error: "Arsa stoğu güncellenemedi: " + propErr.message };

  const newBalance = balance - totalPaid;
  const { error: upErr } = await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", user.id);
  if (upErr) {
    await supabase
      .from("properties")
      .update({ available_m2: available, sold_m2: getPropertySoldM2(property), updated_at: new Date().toISOString() })
      .eq("id", property.id);
    return { ok: false, error: "Bakiye güncellenemedi: " + upErr.message };
  }

  const payload = {
    user_id: user.id,
    property_id: property.id,
    m2: effectiveM2,
    total_paid: totalPaid,
    entry_price_m2: entryPriceM2,
    amount: totalPaid,
    entry_price: entryPriceM2,
    units: effectiveM2,
  };
  const { data: posIns, error: posErr } = await supabase.from("positions").insert(payload).select("id").single();
  if (posErr) {
    await supabase.from("wallets").update({ balance }).eq("user_id", user.id);
    await supabase
      .from("properties")
      .update({ available_m2: available, sold_m2: getPropertySoldM2(property), updated_at: new Date().toISOString() })
      .eq("id", property.id);
    return { ok: false, error: "Pozisyon açılamadı: " + posErr.message };
  }

  if (posIns?.id) void recordBuyRevenue(property.id, totalPaid, posIns.id);

  return { ok: true, m2: effectiveM2, totalPaid, newBalance, positionId: posIns?.id ?? "" };
}

async function recordBuyRevenue(propertyId: string, totalPaid: number, positionId?: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/platform/revenue/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ propertyId, totalPaid, positionId }),
    });
    if (!res.ok) console.warn("[revenue/buy]", await res.text());
  } catch (e) {
    console.warn("[revenue/buy]", e);
  }
}
