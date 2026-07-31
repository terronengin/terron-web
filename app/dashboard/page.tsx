"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../components/AppShell";
import MapViewV2 from "../components/map/MapViewV2";
import { supabase } from "../../lib/supabaseClient";
import { getCachedProperties, invalidatePropertiesCache } from "../../lib/propertiesCache";
import { isVisibleOnExplorer } from "@/lib/propertyListing";
import {
  calculateSimpleBuyQuoteTRY,
  calculateSimpleBuyQuoteFromGrossTRY,
  getPostBuyPriceMultiplier,
} from "@/lib/sim/realEstatePrice";
import { getTerronSalePricePerM2, getDemandPressure } from "@/lib/propertySalePrice";
import { normalizePropertyForPanel } from "@/lib/normalizePropertyForPanel";
import { deriveZoningBandFromLabel } from "@/lib/investment/propertyInvestmentModel";
import { normalizeExplorerLatLng } from "@/lib/dashboard/explorerCoords";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import type { PropertyRow } from "@/lib/terron/propertyRow";

type MarketArea = {
  id: string;
  name?: string;
  city: string;
  district?: string | null;
  base_m2_price: number;
  expected_real_return_annual: number;
  inflation_annual: number;
  vol_annual: number;
  cycle_strength: number;
  shock_prob_annual: number;
  shock_size: number;
};

/** Supabase satırı; `area` join ile gelir */
type Property = PropertyRow & { area?: MarketArea | null };

type RiskBand = "" | "low" | "mid" | "high";
type TrendBand = "" | "rising" | "flat" | "falling";
type PriceBand = "" | "0-10000" | "10001-25000" | "25001-50000" | "50001-100000" | "100001+";
type ZoningBand = "" | "imarli" | "imarsiz" | "bilinmiyor" | "mixed";
type AreaBand = "" | "0-500" | "501-2000" | "2001-10000" | "10001+";
type InsightTab = "arsa" | "gelisim" | "risk";

type CartItem = {
  key: string;
  property: Property;
  m2: number;
  salePricePerM2: number;
  discountedPricePerM2: number;
  bulkDiscountRate: number;
  grossAssetValue: number;
  buyFee: number;
  totalPaid: number;
};

type FetchClientPaginatedResult = {
  rows: Property[];
  error?: Error | null;
  strategy?: string;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  );
}

function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);

  const [items, setItems] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [displayName, setDisplayName] = useState<string>("admin");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");

  const [riskBand, setRiskBand] = useState<RiskBand>("");
  const [trendBand, setTrendBand] = useState<TrendBand>("");
  const [priceBand, setPriceBand] = useState<PriceBand>("");
  const [zoning, setZoning] = useState<ZoningBand>("");
  const [areaBand, setAreaBand] = useState<AreaBand>("");

  const [buyInProgress, setBuyInProgress] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [buyM2, setBuyM2] = useState(10);
  const [buyBudget, setBuyBudget] = useState(0);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [activeInsightTab, setActiveInsightTab] = useState<InsightTab>("arsa");
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [keypadStr, setKeypadStr] = useState("0");

  /** Üst bar artık paylaşılan AppShell/TopBar'da — bu sayfa içindeki mutlak konumlamalar için header yüksekliği 0. */
  const headerH = 0;
  /** Sadece position:"fixed" (viewport-relative) öğeler için — AppShell'in TopBar'ı ile aynı yükseklik (bkz. TopBar.tsx). */
  const TOPBAR_H = 56;

  /** Harita / panel: yayındaki tüm görünür ilanlar (seeded + kullanıcı) */
  function showListedProperty(p: Property | null): boolean {
    return !!p && isVisibleOnExplorer(p);
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 980);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  function clamp01(x: number) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  function getPropertyAvailableM2(p: Property | null) {
    if (!p) return 0;
    const total = Number(p.total_area_m2 ?? 0);
    const available =
      p.available_m2 != null ? Number(p.available_m2) : Math.max(0, total - Number(p.sold_m2 ?? 0));
    return Math.max(0, available);
  }

  function getPropertySoldM2(p: Property | null) {
    if (!p) return 0;
    const total = Number(p.total_area_m2 ?? 0);
    if (p.sold_m2 != null) return Math.max(0, Number(p.sold_m2));
    return Math.max(0, total - getPropertyAvailableM2(p));
  }

  function getBuyQuoteForProperty(p: Property | null, m2: number) {
    if (!p) {
      return {
        salePricePerM2: 0,
        discountedPricePerM2: 0,
        bulkDiscountRate: 0,
        grossAssetValue: 0,
        buyFee: 0,
        totalCost: 0,
        shareOfParcel: 0,
        parcelShareMultiplier: 1,
        parcelShareLabel: "",
        adjustedListPricePerM2: 0,
      };
    }
    const salePx = getTerronSalePricePerM2(p, userId ?? "global");
    const totalParcel = Math.max(1, Number(p.total_area_m2 ?? 1));
    const qty = Math.max(0, Number(m2) || 0);
    return calculateSimpleBuyQuoteTRY(salePx, qty, { totalParcelM2: totalParcel });
  }

  /** Sepet / Satın Al: brüt TL girilmişse brüt tabanlı teklif; değilse yalnızca girilen m² (min ile doldurulmaz). */
  function getActiveBuyQuoteForAction(p: Property | null, buyM2Val: number, buyBudgetVal: number) {
    if (!p) {
      return { quote: null as ReturnType<typeof getBuyQuoteForProperty> | null, effectiveM2: 0 };
    }
    const gb = Math.round(buyBudgetVal);
    const salePx = getTerronSalePricePerM2(p, userId ?? "global");
    const totalParcel = Math.max(1, Number(p.total_area_m2 ?? 1));
    if (gb > 0) {
      const quote = calculateSimpleBuyQuoteFromGrossTRY(salePx, gb, { totalParcelM2: totalParcel });
      return { quote, effectiveM2: Number(quote.impliedM2 ?? 0) };
    }
    const rawM2 = Math.max(0, Number(buyM2Val) || 0);
    const quote = getBuyQuoteForProperty(p, rawM2);
    return { quote, effectiveM2: rawM2 };
  }

  function updateLocalPropertyM2(propertyId: string, purchasedM2: number) {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== propertyId) return p;
        const available = getPropertyAvailableM2(p);
        const sold = getPropertySoldM2(p);
        const currentPrice = Number(p.price_per_m2 ?? p.area?.base_m2_price ?? 1);
        const buyLift = getPostBuyPriceMultiplier(purchasedM2);
        return {
          ...p,
          available_m2: Math.max(0, available - purchasedM2),
          sold_m2: sold + purchasedM2,
          price_per_m2: Math.max(1, currentPrice * buyLift),
        };
      })
    );
    setSelected((prev) => {
      if (!prev || prev.id !== propertyId) return prev;
      const available = getPropertyAvailableM2(prev);
      const sold = getPropertySoldM2(prev);
      const currentPrice = Number(prev.price_per_m2 ?? prev.area?.base_m2_price ?? 1);
      const buyLift = getPostBuyPriceMultiplier(purchasedM2);
      return {
        ...prev,
        available_m2: Math.max(0, available - purchasedM2),
        sold_m2: sold + purchasedM2,
        price_per_m2: Math.max(1, currentPrice * buyLift),
      };
    });
  }

  function syncBuyFromM2(nextM2: number, p: Property | null) {
    const safeM2 = Math.max(0, nextM2 || 0);
    setBuyM2(safeM2);
    if (!p || safeM2 <= 0) {
      setBuyBudget(0);
      return;
    }
    const quote = getBuyQuoteForProperty(p, safeM2);
    setBuyBudget(Math.round(quote.grossAssetValue));
  }

  /** TL alanı = brüt arsa tutarı (komisyon hariç); m² = brüt / satış ₺/m² */
  function syncBuyFromBudget(nextBudget: number, p: Property | null) {
    const gross = Math.max(0, Math.round(Number(nextBudget) || 0));
    setBuyBudget(gross);
    const salePx = Math.max(1, getTerronSalePricePerM2(p, userId ?? "global"));
    const calcM2 = gross > 0 ? gross / salePx : 0;
    setBuyM2(Number(calcM2.toFixed(8)));
  }

  function cartTotal() {
    return cart.reduce((s, x) => s + Number(x.totalPaid || 0), 0);
  }

  function addSelectedToCart() {
    if (!selected) {
      alert("Önce bir arsa seçin.");
      return;
    }
    const { quote, effectiveM2: m2ForCart } = getActiveBuyQuoteForAction(selected, buyM2, buyBudget);
    if (!quote || !Number.isFinite(m2ForCart) || m2ForCart <= 0) {
      alert("m² miktarı geçersiz.");
      return;
    }
    const minBuy = Math.max(1, Number(selected.min_buy_m2 ?? 1));
    const maxBuy = Number(selected.max_buy_m2 ?? getPropertyAvailableM2(selected));
    const available = getPropertyAvailableM2(selected);
    if (m2ForCart < minBuy) {
      alert(`Minimum alım ${formatNumber(minBuy)} m²`);
      return;
    }
    if (m2ForCart > available) {
      alert(`Bu arsada sadece ${formatNumber(available)} m² kaldı.`);
      return;
    }
    if (Number.isFinite(maxBuy) && m2ForCart > maxBuy) {
      alert(`Bu arsa için tek seferde maksimum ${formatNumber(maxBuy)} m² alabilirsiniz.`);
      return;
    }
    setCart((prev) => [
      {
        key: `${selected.id}_${Date.now()}`,
        property: selected,
        m2: m2ForCart,
        salePricePerM2: quote.salePricePerM2,
        discountedPricePerM2: quote.discountedPricePerM2,
        bulkDiscountRate: quote.bulkDiscountRate,
        grossAssetValue: quote.grossAssetValue,
        buyFee: quote.buyFee,
        totalPaid: quote.totalCost,
      },
      ...prev,
    ]);
    alert("Sepete eklendi ✓");
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((x) => x.key !== key));
  }

  function clearCart() {
    setCart([]);
  }

  async function ensureAndLoadWallet() {
    const { data: sessionRes } = await supabase.auth.getSession();
    const user = sessionRes.session?.user;
    if (!user) return;
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .select("user_id,balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (wErr) {
      console.warn("[wallet] select error:", wErr);
      return;
    }
    if (w?.balance != null) {
      setWalletBalance(Number(w.balance));
      return;
    }
    const { data: ins, error: insErr } = await supabase
      .from("wallets")
      .insert({ user_id: user.id, balance: 1000000 })
      .select("balance")
      .single();
    if (insErr) {
      console.warn("[wallet] insert error:", insErr);
      return;
    }
    setWalletBalance(Number(ins.balance));
  }

  async function syncWalletBalanceToDb(nextBalance: number) {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) throw new Error("Kullanıcı bulunamadı.");
    const rounded = Math.max(0, Math.round(Number(nextBalance || 0)));
    const { data: walletRow, error: walletErr } = await supabase
      .from("wallets")
      .select("user_id,balance")
      .eq("user_id", user.id)
      .maybeSingle();
    if (walletErr) throw walletErr;
    if (!walletRow) {
      const { error: insertErr } = await supabase.from("wallets").insert({
        user_id: user.id,
        balance: rounded,
      });
      if (insertErr) throw insertErr;
      return rounded;
    }
    const { error: updateErr } = await supabase
      .from("wallets")
      .update({ balance: rounded })
      .eq("user_id", user.id);
    if (updateErr) throw updateErr;
    return rounded;
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

  async function handleOpenPosition() {
    try {
      if (!selected) {
        alert("Önce bir arsa seçin.");
        return;
      }
      const { quote, effectiveM2: m2 } = getActiveBuyQuoteForAction(selected, buyM2, buyBudget);
      if (!quote || !Number.isFinite(m2) || m2 <= 0) {
        alert("m² miktarı geçersiz.");
        return;
      }
      const available = getPropertyAvailableM2(selected);
      const minBuy = Math.max(1, Number(selected.min_buy_m2 ?? 1));
      const maxBuy = Number(selected.max_buy_m2 ?? available);
      if (m2 < minBuy) {
        alert(`Minimum alım ${formatNumber(minBuy)} m²`);
        return;
      }
      if (m2 > available) {
        alert(`Bu arsada sadece ${formatNumber(available)} m² kaldı.`);
        return;
      }
      if (Number.isFinite(maxBuy) && m2 > maxBuy) {
        alert(`Bu arsa için tek seferde maksimum ${formatNumber(maxBuy)} m² alabilirsiniz.`);
        return;
      }
      const entryPriceM2 = quote.salePricePerM2;
      const totalPaid = quote.totalCost;

      setBuyInProgress(true);
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        alert("Giriş yapılmamış görünüyor. Tekrar giriş yapın.");
        setBuyInProgress(false);
        return;
      }
      const { data: w, error: wErr } = await supabase
        .from("wallets")
        .select("user_id,balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (wErr) {
        alert("Cüzdan okunamadı: " + wErr.message);
        setBuyInProgress(false);
        return;
      }
      let balance = w?.balance != null ? Number(w.balance) : null;
      if (balance == null) {
        const { data: ins, error: insErr } = await supabase
          .from("wallets")
          .insert({ user_id: user.id, balance: 1000000 })
          .select("balance")
          .single();
        if (insErr) {
          alert("Cüzdan oluşturulamadı: " + insErr.message);
          setBuyInProgress(false);
          return;
        }
        balance = Number(ins.balance);
      }
      if (balance < totalPaid) {
        alert(`Yetersiz bakiye. Bakiye: ₺${formatTRY(Math.round(balance))}`);
        setWalletBalance(balance);
        setBuyInProgress(false);
        return;
      }
      const nextAvailable = Math.max(0, available - m2);
      const nextSold = getPropertySoldM2(selected) + m2;
      const { error: propErr } = await supabase
        .from("properties")
        .update({
          available_m2: nextAvailable,
          sold_m2: nextSold,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id)
        .gte("available_m2", m2);
      if (propErr) {
        alert("Arsa stoğu güncellenemedi: " + propErr.message);
        setBuyInProgress(false);
        return;
      }
      const newBalance = balance - totalPaid;
      const { error: upErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", user.id);
      if (upErr) {
        await supabase
          .from("properties")
          .update({
            available_m2: available,
            sold_m2: getPropertySoldM2(selected),
            updated_at: new Date().toISOString(),
          })
          .eq("id", selected.id);
        alert("Bakiye güncellenemedi: " + upErr.message);
        setBuyInProgress(false);
        return;
      }
      const payload = {
        user_id: user.id,
        property_id: selected.id,
        m2,
        total_paid: totalPaid,
        entry_price_m2: entryPriceM2,
        amount: totalPaid,
        entry_price: entryPriceM2,
        units: m2,
      };
      const { data: posIns, error: posErr } = await supabase.from("positions").insert(payload).select("id").single();
      if (posErr) {
        await supabase
          .from("wallets")
          .update({ balance: balance })
          .eq("user_id", user.id);
        await supabase
          .from("properties")
          .update({
            available_m2: available,
            sold_m2: getPropertySoldM2(selected),
            updated_at: new Date().toISOString(),
          })
          .eq("id", selected.id);
        alert("Pozisyon açılamadı: " + posErr.message);
        setBuyInProgress(false);
        return;
      }
      if (posIns?.id) void recordBuyRevenue(selected.id, totalPaid, posIns.id);
      setWalletBalance(newBalance);
      updateLocalPropertyM2(selected.id, m2);
      await ensureAndLoadWallet();
      invalidatePropertiesCache();
      alert("m² pozisyonu açıldı ✓");
      setBuyInProgress(false);
    } catch (e: unknown) {
      console.error("[POS] exception:", e);
      alert("Beklenmeyen hata: " + (e instanceof Error ? e.message : String(e)));
      setBuyInProgress(false);
    }
  }

  function pressKeypadKey(k: string) {
    setKeypadStr((prev) => {
      let next = prev;
      if (k === "⌫") next = prev.slice(0, -1);
      else if (k === ".") next = prev.includes(".") ? prev : prev + ".";
      else next = prev === "0" ? k : prev + k;
      if (next === "" || next === ".") next = "0";
      const num = Number(next);
      if (Number.isFinite(num) && selected) syncBuyFromM2(num, selected);
      return next;
    });
  }

  async function reviewAndBuyFromKeypad() {
    if (!selected) return;
    const ok = window.confirm(
      `Emri gözden geçir\n\n` +
        `${selected.title}\n` +
        `${formatDecimal(buyM2)} m² × ₺${formatTRY(Math.round(selectedPricePerM2))}/m²\n\n` +
        `Toplam ödenecek: ₺${formatTRY(Math.round(selectedTotalCost))}\n\n` +
        `Onaylıyor musunuz?`
    );
    if (!ok) return;
    await handleOpenPosition();
    setKeypadOpen(false);
  }

  async function handleCheckoutCart() {
    try {
      if (cart.length === 0) {
        alert("Sepet boş.");
        return;
      }
      const total = cartTotal();
      const currentBalance = Number(walletBalance ?? 0);
      if (currentBalance < total) {
        alert(
          `Yetersiz bakiye. Bakiye: ₺${formatTRY(Math.round(currentBalance))} • Sepet: ₺${formatTRY(Math.round(total))}`,
        );
        return;
      }
      setCheckingOut(true);
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) {
        alert("Giriş yapılmamış görünüyor.");
        setCheckingOut(false);
        return;
      }
      const realItems = cart;
      const realTotal = realItems.reduce((s, x) => s + Number(x.totalPaid || 0), 0);
      const { data: w, error: wErr } = await supabase
        .from("wallets")
        .select("user_id,balance")
        .eq("user_id", user.id)
        .maybeSingle();
      if (wErr) {
        alert("Cüzdan okunamadı: " + wErr.message);
        setCheckingOut(false);
        return;
      }
      const balanceDb = w?.balance != null ? Number(w.balance) : currentBalance;
      if (balanceDb < realTotal) {
        alert(
          `Yetersiz bakiye (sunucu). Bakiye: ₺${formatTRY(Math.round(balanceDb))} • Sepet: ₺${formatTRY(Math.round(realTotal))}`
        );
        setCheckingOut(false);
        return;
      }
      const touchedProps: Array<{ id: string; available: number; sold: number }> = [];
      for (const it of realItems) {
        const currentProp = items.find((x) => x.id === it.property.id) ?? it.property;
        const avail = getPropertyAvailableM2(currentProp);
        const sold = getPropertySoldM2(currentProp);
        if (it.m2 > avail) {
          alert(`${currentProp.title} için yeterli m² kalmadı.`);
          setCheckingOut(false);
          return;
        }
        touchedProps.push({ id: currentProp.id, available: avail, sold });
        const { error: propErr } = await supabase
          .from("properties")
          .update({
            available_m2: Math.max(0, avail - it.m2),
            sold_m2: sold + it.m2,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentProp.id)
          .gte("available_m2", it.m2);
        if (propErr) {
          alert("Arsa stoğu güncellenemedi: " + propErr.message);
          setCheckingOut(false);
          return;
        }
      }
      const newBalanceDb = balanceDb - realTotal;
      const { error: upErr } = await supabase
        .from("wallets")
        .update({ balance: newBalanceDb })
        .eq("user_id", user.id);
      if (upErr) {
        for (const p of touchedProps) {
          await supabase
            .from("properties")
            .update({
              available_m2: p.available,
              sold_m2: p.sold,
              updated_at: new Date().toISOString(),
            })
            .eq("id", p.id);
        }
        alert("Bakiye güncellenemedi: " + upErr.message);
        setCheckingOut(false);
        return;
      }
      const insertedIds: string[] = [];
      for (const it of realItems) {
        const payload = {
          user_id: user.id,
          property_id: it.property.id,
          m2: it.m2,
          total_paid: it.totalPaid,
          entry_price_m2: it.salePricePerM2,
          amount: it.totalPaid,
          entry_price: it.salePricePerM2,
          units: it.m2,
        };
        const { data: ins, error: posErr } = await supabase
          .from("positions")
          .insert(payload)
          .select("id")
          .single();
        if (posErr) {
          await supabase
            .from("wallets")
            .update({ balance: balanceDb })
            .eq("user_id", user.id);
          for (const p of touchedProps) {
            await supabase
              .from("properties")
              .update({
                available_m2: p.available,
                sold_m2: p.sold,
                updated_at: new Date().toISOString(),
              })
              .eq("id", p.id);
          }
          if (insertedIds.length > 0) {
            await supabase.from("positions").delete().in("id", insertedIds);
          }
          alert("Toplu alım sırasında hata: " + posErr.message);
          setCheckingOut(false);
          return;
        }
        if (ins?.id) {
          insertedIds.push(String(ins.id));
          void recordBuyRevenue(it.property.id, it.totalPaid, String(ins.id));
        }
        updateLocalPropertyM2(it.property.id, it.m2);
      }
      setWalletBalance(newBalanceDb);
      await ensureAndLoadWallet();

      clearCart();
      invalidatePropertiesCache();
      alert("Toplu m² alımı tamam ✓");
      setCheckingOut(false);
    } catch (e: unknown) {
      console.error("[CART] exception:", e);
      alert("Beklenmeyen hata: " + (e instanceof Error ? e.message : String(e)));
      setCheckingOut(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user;

      setEmail(u?.email ?? null);
      setUserId(u?.id ?? null);

      const metaName =
        (u?.user_metadata?.full_name as string) ||
        (u?.user_metadata?.name as string) ||
        (u?.email ? u.email.split("@")[0] : "admin");

      const metaAvatar =
        (u?.user_metadata?.avatar_url as string) ||
        (u?.user_metadata?.picture as string) ||
        "";

      setDisplayName(metaName);
      setAvatarUrl(metaAvatar);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user;

      setEmail(u?.email ?? null);
      setUserId(u?.id ?? null);

      const metaName =
        (u?.user_metadata?.full_name as string) ||
        (u?.user_metadata?.name as string) ||
        (u?.email ? u.email.split("@")[0] : "admin");

      const metaAvatar =
        (u?.user_metadata?.avatar_url as string) ||
        (u?.user_metadata?.picture as string) ||
        "";

      setDisplayName(metaName);
      setAvatarUrl(metaAvatar);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!email) return;
    void ensureAndLoadWallet();
  }, [email]);

  async function load(): Promise<void> {
    /** Sunucu tarafı explorer filtreleri (.eq, .lte, …) — select ile aynı scope içinde */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyExplorerFilters = (q: any) => {
      let qq = q
        .in("listing_status", ["approved"])
        .order("created_at", { ascending: false });

      if (city) qq = qq.eq("city", city);
      if (district) qq = qq.eq("district", district);
      if (neighborhood) qq = qq.eq("neighborhood", neighborhood);

      if (riskBand) {
        if (riskBand === "low") qq = qq.lte("risk_score", 30);
        if (riskBand === "mid") qq = qq.gt("risk_score", 30).lte("risk_score", 70);
        if (riskBand === "high") qq = qq.gt("risk_score", 70);
      }

      if (trendBand === "rising") qq = qq.gte("last_30d_change", 2.5);
      if (trendBand === "flat") qq = qq.gte("last_30d_change", -2).lte("last_30d_change", 2.5);
      if (trendBand === "falling") qq = qq.lte("last_30d_change", -2);

      if (priceBand === "0-10000") qq = qq.gte("price_per_m2", 0).lte("price_per_m2", 10000);
      if (priceBand === "10001-25000") qq = qq.gte("price_per_m2", 10001).lte("price_per_m2", 25000);
      if (priceBand === "25001-50000") qq = qq.gte("price_per_m2", 25001).lte("price_per_m2", 50000);
      if (priceBand === "50001-100000") qq = qq.gte("price_per_m2", 50001).lte("price_per_m2", 100000);
      if (priceBand === "100001+") qq = qq.gte("price_per_m2", 100001);

      if (areaBand === "0-500") qq = qq.gte("total_area_m2", 0).lte("total_area_m2", 500);
      if (areaBand === "501-2000") qq = qq.gte("total_area_m2", 501).lte("total_area_m2", 2000);
      if (areaBand === "2001-10000") qq = qq.gte("total_area_m2", 2001).lte("total_area_m2", 10000);
      if (areaBand === "10001+") qq = qq.gte("total_area_m2", 10001);

      return qq;
    };

    async function fetchClientPaginated(): Promise<FetchClientPaginatedResult> {
      /** Yalnızca çekirdek kolonlar — şemada olmayan alan sorguyu düşürür. */
      const CLIENT_PROPERTIES_SELECT_MAIN =
        "id,title,city,district,neighborhood,price_per_m2,total_area_m2,available_m2,sold_m2,min_buy_m2,max_buy_m2,risk_score,development_score,expected_annual_return,last_30d_change,zoning_status,latitude,longitude,created_at";
      const CLIENT_PROPERTIES_SELECT_FALLBACK =
        "id,title,city,district,price_per_m2,available_m2,sold_m2,latitude,longitude";

      const PAGE = 1000;
      let from = 0;
      const acc: Property[] = [];

      const logSupabaseError = (label: string, err: unknown) => {
        console.error(`[dashboard] ${label} (raw)`, err);
        try {
          console.error(`[dashboard] ${label} (json)`, JSON.stringify(err, null, 2));
        } catch {
          console.error(`[dashboard] ${label} (json fallback)`, String(err));
        }
      };

      const normalizeRow = (row: Record<string, unknown>): Property | null => {
        const rawLat = Number(row?.latitude);
        const rawLng = Number(row?.longitude);

        let lat = rawLat;
        let lng = rawLng;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        if (lat > 45 && lng < 45) {
          const temp = lat;
          lat = lng;
          lng = temp;
        }

        if (lat < 35 || lat > 43 || lng < 25 || lng > 45) return null;

        const lsRaw = row.listing_status;
        const listing_status =
          typeof lsRaw === "string" && lsRaw.trim() !== "" ? lsRaw.trim() : "approved";

        return {
          ...row,
          latitude: lat,
          longitude: lng,
          listing_status,
        } as Property;
      };

      while (true) {
        console.log("[dashboard] starting property page fetch", { from, PAGE });

        let data: unknown[] | null = null;
        let queryError: { message?: string; details?: string; hint?: string; code?: string } | null = null;
        let pageStrategy = "server_filters";

        try {
          let q = supabase.from("properties").select(CLIENT_PROPERTIES_SELECT_MAIN);

          try {
            q = typeof applyExplorerFilters === "function" ? applyExplorerFilters(q) : q.order("created_at", { ascending: false });
          } catch (filterBuildError) {
            logSupabaseError("applyExplorerFilters build failed", filterBuildError);
            q = q.order("created_at", { ascending: false });
            pageStrategy = "filter_build_failed_fallback";
          }

          const res = await q.range(from, from + PAGE - 1);
          data = (res.data as unknown[]) ?? null;
          queryError = res.error
            ? (res.error as { message?: string; details?: string; hint?: string; code?: string })
            : null;
        } catch (e) {
          logSupabaseError("filtered query threw", e);
          queryError = { message: String(e) };
        }

        if (queryError) {
          logSupabaseError("fetchClientPaginated primary query error", queryError);

          pageStrategy = "minimal_fallback";

          try {
            const fallback = await supabase
              .from("properties")
              .select(CLIENT_PROPERTIES_SELECT_FALLBACK)
              .in("listing_status", ["approved"])
              .order("created_at", { ascending: false })
              .range(from, from + PAGE - 1);

            data = (fallback.data as unknown[]) ?? null;
            const fbErr = fallback.error;

            if (fbErr) {
              logSupabaseError("fetchClientPaginated fallback query error", fbErr);

              return {
                rows: acc,
                error: null,
                strategy: "fallback_failed_continue",
              };
            }
          } catch (fallbackThrown) {
            logSupabaseError("fallback query threw", fallbackThrown);
            return {
              rows: acc,
              error: null,
              strategy: "fallback_threw_continue",
            };
          }
        }

        const chunk = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        console.log("[dashboard] fetched raw chunk:", chunk.length);

        let normalized = chunk
          .map(normalizeRow)
          .filter((x): x is Property => x !== null)
          .map((p) => normalizePropertyForPanel(p as any) as Property);

        // Haritada yalnızca normalizeRow ile TR içi geçerli koordinatlı kayıtlar kalır; mapItemsForView ek süzüm yapar.
        // Haritada yine yalnızca normalizeRow ile TR içi geçerli koordinatlı kayıtlar kalır; mapItemsForView ek süzüm yapar.

        console.log("[dashboard] normalized valid chunk:", normalized.length);
        acc.push(...normalized);

        if (!data || chunk.length < PAGE) break;
        from += PAGE;
      }

      console.log("[dashboard] final fetched rows:", acc.length);

      return {
        rows: acc,
        error: null,
        strategy: "success",
      };
    }

    let all: Property[] = [];
    let loadSource = "none";

    try {
      const cached = await getCachedProperties();
      if (cached.length > 0) {
        all = cached;
        loadSource = "api_service_role";
      }
    } catch (e) {
      console.warn("[dashboard] /api/properties/dashboard fetch failed:", e);
    }

    if (all.length === 0) {
      const clientResult = await fetchClientPaginated();
      all = clientResult.rows;
      loadSource = clientResult.strategy ?? "client_fetch";
      if (clientResult.strategy && clientResult.strategy !== "success") {
        console.error("[dashboard] client fetch ended with strategy (no throw):", clientResult.strategy);
      }
    }

    let mapReady = 0;
    for (const p of all) {
      if (normalizeExplorerLatLng(p.latitude, p.longitude)) mapReady += 1;
    }

    console.log("[dashboard] fetched rows:", all.length);
    console.log("[dashboard] properties load:", {
      totalRowsFetched: all.length,
      afterCoordNormalization: mapReady,
      loadSource,
    });

    setItems(all.map((p) => normalizePropertyForPanel(p as any) as Property));
    console.log("[dashboard] map properties count:", all.length);
  }

  useEffect(() => {
    if (!email) {
      setPropertiesLoading(false);
      return;
    }
    let mounted = true;
    const onRefresh = () => {
      if (!mounted) return;
      setPropertiesLoading(true);
      void load().finally(() => {
        if (mounted) setPropertiesLoading(false);
      });
    };
    if (typeof window !== "undefined") {
      window.addEventListener("terron:properties:refresh", onRefresh);
    }
    setPropertiesLoading(true);
    void load().finally(() => {
      if (mounted) setPropertiesLoading(false);
    });
    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("terron:properties:refresh", onRefresh);
      }
    };
  }, [email, city, district, neighborhood, riskBand, trendBand, priceBand, areaBand]);

  useEffect(() => {
    if (items.length === 0) return;
    const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const isTurkey = (p: Property) => {
      const c = norm(p.country);
      return !c || c === "turkiye" || c === "türkiye" || c === "turkey";
    };
    const turkeyCount = items.filter(isTurkey).length;
    const globalCount = items.length - turkeyCount;
    const getRegion = (p: Property) => {
      if (isTurkey(p)) return "Turkey";
      const loc = norm(p.country || p.city);
      if (!loc) return "Global";
      if (["uae", "qatar", "saudi", "dubai", "abu dhabi", "oman", "bahrain", "kuwait"].some((x) => loc.includes(x))) return "Körfez";
      if (["usa", "united states", "us", "america", "canada", "mexico"].some((x) => loc.includes(x))) return "ABD";
      if (["russia", "kazakhstan", "azerbaijan", "belarus", "ukraine", "moscow"].some((x) => loc.includes(x))) return "Rusya & CIS";
      if (["germany", "uk", "united kingdom", "france", "spain", "italy", "london"].some((x) => loc.includes(x))) return "Avrupa";
      return "Global";
    };
    const regionCounts = items.reduce<Record<string, number>>((acc, p) => {
      const r = getRegion(p);
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    console.log("Turkey property count:", turkeyCount);
    console.log("Global property count:", globalCount);
    console.log("Region counts summary:", regionCounts);
  }, [items]);

  useEffect(() => {
    setSelected(null);
    setBuyInProgress(false);
  }, [city, district, neighborhood, riskBand, trendBand, priceBand, zoning, areaBand, searchText]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let arr = [...items];

    if (zoning) {
      arr = arr.filter((p) => {
        const raw = String(p.zoning_band ?? "").trim();
        const band =
          raw === "imarli" || raw === "imarsiz" || raw === "bilinmiyor" || raw === "mixed"
            ? raw
            : deriveZoningBandFromLabel(String(p.zoning_status ?? ""));
        return band === zoning;
      });
    }

    if (q) {
      arr = arr.filter((p) => {
        const blob = [
          p.title,
          p.id,
          p.country ?? "",
          p.city,
          p.district ?? "",
          p.neighborhood ?? "",
          p.zoning_status ?? "",
          p.land_type ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return blob.includes(q);
      });
    }

    return arr;
  }, [items, searchText, zoning]);

  /** UUID / string id farkları (yeni kayıtlar bazen farklı casing) */
  function samePropertyId(a: unknown, b: unknown): boolean {
    const sa = String(a ?? "").trim();
    const sb = String(b ?? "").trim();
    if (sa === sb) return true;
    return sa.toLowerCase() === sb.toLowerCase();
  }

  /** UUID tire / format farkları (Postgres vs string) */
  function samePropertyIdLoose(a: unknown, b: unknown): boolean {
    if (samePropertyId(a, b)) return true;
    const sa = String(a ?? "")
      .replace(/-/g, "")
      .toLowerCase();
    const sb = String(b ?? "")
      .replace(/-/g, "")
      .toLowerCase();
    if (sa.length >= 24 && sb.length >= 24 && sa === sb) return true;
    return false;
  }

  function selectPropertyForPanel(p: Property | null | undefined): Property | null {
    if (!p) return null;
    return normalizePropertyForPanel(p as any) as Property;
  }

  /** Market sekmesinden "?p=<id>" ile gelindiğinde ilgili ilanı otomatik seçip paneli aç. */
  useEffect(() => {
    const pid = searchParams?.get("p");
    if (!pid || items.length === 0) return;
    const found = items.find((x) => String(x.id) === pid);
    if (found) {
      setSelected(selectPropertyForPanel(found));
      setPanelOpen(false);
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchParams]);

  /** MapView: id boşken kullanılan ll_lat_lng — id ile DB eşleşmezse koordinattan bul */
  function parseSyntheticLlId(id: string): { lat: number; lng: number } | null {
    const m = /^ll_([\d.-]+)_([\d.-]+)$/.exec(String(id).trim());
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function normLoc(s: string | null | undefined): string {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function hashStringToSeed32(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Harita tıklaması → tam Property: id → konum (şehir/ilçe/mahalle) → koordinat */
  function findPropertyForMapSelection(p: {
    id: string;
    propertyId?: string | null;
    title: string;
    city: string;
    district: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
  }): Property | null {
    const keys = [p.id, p.propertyId].filter((x) => x != null && String(x).trim() !== "").map((x) => String(x).trim());
    for (const k of keys) {
      const f =
        items.find((x) => samePropertyIdLoose(x.id, k)) ?? filteredItems.find((x) => samePropertyIdLoose(x.id, k));
      if (f) return f;
    }

    const nc = normLoc(p.city);
    const nd = normLoc(p.district);
    const nn = normLoc(p.neighborhood);
    const nt = normLoc(p.title);

    if (nc.trim() !== "") {
      const locCandidates = items.filter((x) => {
        if (normLoc(x.city) !== nc) return false;
        if (normLoc(x.district) !== nd) return false;
        if (normLoc(x.neighborhood) !== nn) return false;
        return true;
      });

      if (locCandidates.length === 1) return locCandidates[0];

      if (locCandidates.length > 1) {
        const byTitle = locCandidates.filter((x) => normLoc(x.title) === nt);
        if (byTitle.length === 1) return byTitle[0];

        const lat0 = Number(p.latitude);
        const lng0 = Number(p.longitude);
        if (Number.isFinite(lat0) && Number.isFinite(lng0)) {
          const eps = 1.2e-4;
          let best: Property | null = null;
          let bestSum = Infinity;
          for (const x of locCandidates) {
            const xlat = Number(x.latitude);
            const xlng = Number(x.longitude);
            if (!Number.isFinite(xlat) || !Number.isFinite(xlng)) continue;
            const sum = Math.abs(xlat - lat0) + Math.abs(xlng - lng0);
            if (sum < bestSum && sum <= eps * 2) {
              bestSum = sum;
              best = x;
            }
          }
          if (best) return best;
        }
        if (byTitle.length > 0) return byTitle[0];
      }
    }

    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const eps = 1.2e-4;
    let best: Property | null = null;
    let bestSum = Infinity;
    for (const x of items) {
      const xlat = Number(x.latitude);
      const xlng = Number(x.longitude);
      if (!Number.isFinite(xlat) || !Number.isFinite(xlng)) continue;
      const sum = Math.abs(xlat - lat) + Math.abs(xlng - lng);
      if (sum < bestSum && sum <= eps * 2) {
        bestSum = sum;
        best = x;
      }
    }
    return best;
  }

  type MapItemPayload = {
    id: string;
    propertyId?: string | null;
    title: string;
    city: string;
    district: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    country?: string | null;
    price_per_m2?: number | null;
    total_area_m2?: number;
    available_m2?: number | null;
    sold_m2?: number | null;
    min_buy_m2?: number | null;
    max_buy_m2?: number | null;
    zoning_status?: string | null;
    is_real?: boolean | null;
    listing_status?: string | null;
    listing_description?: string | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_email?: string | null;
    is_verified?: boolean | null;
    ada_no?: string | null;
    parcel_no?: string | null;
  };

  /** items’ta bulunamadıysa ama MapView tam alan gönderdiyse (aynı id ile) */
  function propertyFromMapItemPayload(p: MapItemPayload): Property | null {
    const id = String(p.propertyId ?? p.id ?? "").trim();
    if (!id) return null;
    const ta = Number(p.total_area_m2);
    const total = Number.isFinite(ta) && ta > 0 ? ta : 1000;
    return normalizePropertyForPanel({
      id,
      title: p.title || "Arsa",
      city: p.city || "—",
      district: p.district,
      neighborhood: p.neighborhood ?? null,
      country: p.country ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      total_area_m2: total,
      available_m2: p.available_m2 ?? null,
      sold_m2: p.sold_m2 ?? null,
      min_buy_m2: p.min_buy_m2 ?? null,
      max_buy_m2: p.max_buy_m2 ?? null,
      risk_score: 50,
      development_score: 50,
      expected_annual_return: 0,
      last_30d_change: 0,
      price_per_m2: p.price_per_m2 ?? 0,
      zoning_status: p.zoning_status ?? "bilinmiyor",
      is_real: p.is_real,
      listing_status: p.listing_status ?? null,
      listing_description: p.listing_description ?? null,
      owner_name: p.owner_name ?? null,
      owner_phone: p.owner_phone ?? null,
      owner_email: p.owner_email ?? null,
      is_verified: p.is_verified ?? null,
      ada_no: p.ada_no ?? null,
      parcel_no: p.parcel_no ?? null,
    }) as Property;
  }

  /** Son çare: deterministik çeşitlilik (tümü 0 m² / aynı metin olmasın) */
  function propertyFromMapFallback(p: {
    id: string;
    title: string;
    city: string;
    district: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
    country?: string | null;
  }): Property {
    const seed = hashStringToSeed32(`${p.id}|${p.latitude}|${p.longitude}`);
    const r = (n: number) => (((seed ^ n * 2246822519) * 2654435761) >>> 0) % 1000000;
    const total = 2000 + (r(1) % 8000);
    const sold = Math.min(Math.floor(total * (0.08 + (r(2) % 25) / 200)), Math.max(0, total - 100));
    const available = Math.max(0, total - sold);
    const price = 2500 + (r(3) % 45000);
    return normalizePropertyForPanel({
      id: p.id,
      title: p.title || "Arsa",
      city: p.city || "—",
      district: p.district,
      neighborhood: p.neighborhood ?? null,
      latitude: p.latitude,
      longitude: p.longitude,
      country: p.country ?? null,
      total_area_m2: total,
      available_m2: available,
      sold_m2: sold,
      risk_score: 30 + (r(4) % 50),
      development_score: 30 + (r(5) % 50),
      expected_annual_return: (r(6) % 15) + 2,
      last_30d_change: ((r(7) % 21) - 10) / 10,
      price_per_m2: price,
      zoning_status: "bilinmiyor",
    }) as Property;
  }

  /** MapView: arama metni sonrası liste; koordinat TR + normalizeExplorerLatLng */
  const mapItemsForView = useMemo(() => {
    const out = filteredItems
      .map((p) => {
        const n = normalizeExplorerLatLng(p.latitude, p.longitude);
        if (!n) return null;
        const lat = n.latitude;
        const lng = n.longitude;
        const idStr = String(p.id ?? "").trim();
        return {
          id: idStr || `ll_${lat.toFixed(6)}_${lng.toFixed(6)}`,
          propertyId: idStr || undefined,
          title: String(p.title ?? "").trim() || "Arsa",
          city: String(p.city ?? "").trim() || "—",
          district: p.district ?? null,
          neighborhood: p.neighborhood ?? null,
          latitude: lat,
          longitude: lng,
          country: p.country ?? undefined,
          price_per_m2: p.price_per_m2 ?? null,
          total_area_m2: p.total_area_m2,
          available_m2: p.available_m2 ?? null,
          sold_m2: p.sold_m2 ?? null,
          min_buy_m2: p.min_buy_m2 ?? null,
          max_buy_m2: p.max_buy_m2 ?? null,
          zoning_status: p.zoning_status ?? null,
          is_real: p.is_real,
          listing_status: p.listing_status ?? null,
          listing_description: p.listing_description ?? null,
          owner_name: p.owner_name ?? null,
          owner_phone: p.owner_phone ?? null,
          owner_email: p.owner_email ?? null,
          is_verified: p.is_verified ?? null,
          ada_no: p.ada_no ?? null,
          parcel_no: p.parcel_no ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    console.log("[dashboard] map pipeline:", {
      itemsAfterSearchFilter: filteredItems.length,
      mapItemsAfterCoordFilter: out.length,
    });
    return out;
  }, [filteredItems]);

  const visibleItems = useMemo(() => {
    let arr = [...filteredItems];
    if (city) arr = arr.filter((x) => x.city === city);
    if (district) arr = arr.filter((x) => x.district === district);
    if (neighborhood) arr = arr.filter((x) => x.neighborhood === neighborhood);
    return arr;
  }, [filteredItems, city, district, neighborhood]);

  const cities = useMemo(() => {
    const set = new Set(filteredItems.map((x) => x.city));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [filteredItems]);

  const districts = useMemo(() => {
    const list = filteredItems
      .filter((x) => (city ? x.city === city : true))
      .map((x) => x.district)
      .filter((d): d is string => !!d && d.trim().length > 0);

    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "tr"));
  }, [filteredItems, city]);

  const neighborhoods = useMemo(() => {
    const list = filteredItems
      .filter((x) => (city ? x.city === city : true))
      .filter((x) => (district ? x.district === district : true))
      .map((x) => x.neighborhood)
      .filter((n): n is string => !!n && n.trim().length > 0);

    return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "tr"));
  }, [filteredItems, city, district]);

  const regionSummary = useMemo(() => {
    const arr = visibleItems;
    const count = arr.length;

    if (!count) {
      return {
        count: 0,
        avgPricePerM2: 0,
        avgRisk: 0,
        avgDevelopment: 0,
        avgReturn: 0,
        totalArea: 0,
        availableArea: 0,
        soldArea: 0,
      };
    }

    const scope = userId ?? "global";
    const avgPricePerM2 =
      arr.reduce((s, x) => s + Number(getTerronSalePricePerM2(x, scope)), 0) / Math.max(1, count);
    const avgRisk = arr.reduce((s, x) => s + Number(x.risk_score ?? 0), 0) / Math.max(1, count);
    const avgDevelopment =
      arr.reduce((s, x) => s + Number(x.development_score ?? 0), 0) / Math.max(1, count);
    const avgReturn =
      arr.reduce((s, x) => s + Number(x.expected_annual_return ?? 0), 0) / Math.max(1, count);

    const totalArea = arr.reduce((s, x) => s + Number(x.total_area_m2 ?? 0), 0);
    const availableArea = arr.reduce((s, x) => s + getPropertyAvailableM2(x), 0);
    const soldArea = arr.reduce((s, x) => s + getPropertySoldM2(x), 0);

    return {
      count,
      avgPricePerM2,
      avgRisk,
      avgDevelopment,
      avgReturn,
      totalArea,
      availableArea,
      soldArea,
    };
  }, [visibleItems, userId]);

  const selectedAreaLabel = useMemo(() => {
    if (city && district && neighborhood) return `${city} / ${district} / ${neighborhood}`;
    if (city && district) return `${city} / ${district}`;
    if (city) return city;
    return "Türkiye Geneli";
  }, [city, district, neighborhood]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const selectedPricePerM2 = selected ? getTerronSalePricePerM2(selected, userId ?? "global") : 0;
  const selectedAvailableM2 = getPropertyAvailableM2(selected);
  const selectedSoldM2 = getPropertySoldM2(selected);
  const selectedMinBuyM2 = Math.max(1, Number(selected?.min_buy_m2 ?? 1));
  const selectedMaxBuyM2 = Number(selected?.max_buy_m2 ?? selectedAvailableM2);
  const { selectedQuote, selectedDisplayM2 } = useMemo(() => {
    if (!selected) return { selectedQuote: null, selectedDisplayM2: 0 };
    const gb = Math.round(buyBudget);
    const salePx = getTerronSalePricePerM2(selected, userId ?? "global");
    const totalParcel = Math.max(1, Number(selected.total_area_m2 ?? 1));
    const previewM2 = Math.max(0, Number(buyM2) || selectedMinBuyM2);
    if (gb > 0) {
      const quote = calculateSimpleBuyQuoteFromGrossTRY(salePx, gb, { totalParcelM2: totalParcel });
      return { selectedQuote: quote, selectedDisplayM2: quote.impliedM2 ?? previewM2 };
    }
    const quote = getBuyQuoteForProperty(selected, previewM2);
    return { selectedQuote: quote, selectedDisplayM2: previewM2 };
  }, [selected, buyM2, buyBudget, selectedMinBuyM2, userId]);
  const selectedMinBuyCost = selected ? getBuyQuoteForProperty(selected, selectedMinBuyM2).totalCost : 0;
  const selectedTotalCost = Math.max(0, Number(selectedQuote?.totalCost ?? 0));
  const selectedDemandPressure = selected ? getDemandPressure(selected) : 0;
  const listingDemandRatio = selected
    ? clamp01(getPropertySoldM2(selected) / Math.max(1, Number(selected.total_area_m2 ?? 1)))
    : 0;

  useEffect(() => {
    if (!selected) return;
    const safeMin = Math.max(1, Number(selected.min_buy_m2 ?? 1));
    const quote = getBuyQuoteForProperty(selected, safeMin);
    setBuyM2(safeMin);
    setBuyBudget(Math.round(quote.grossAssetValue));
    setActiveInsightTab("arsa");
  }, [selected?.id]);

  const soldPct =
    selected && Number(selected.total_area_m2) > 0
      ? (selectedSoldM2 / Number(selected.total_area_m2)) * 100
      : 0;

  const regionList = [...visibleItems]
    .sort((a, b) => {
      const aScore =
        Number(a.development_score ?? 0) * 1.3 +
        Number(a.expected_annual_return ?? 0) * 1.1 -
        Number(a.risk_score ?? 0) * 0.8;
      const bScore =
        Number(b.development_score ?? 0) * 1.3 +
        Number(b.expected_annual_return ?? 0) * 1.1 -
        Number(b.risk_score ?? 0) * 0.8;
      return bScore - aScore;
    })
    .slice(0, 16);

  const developmentHistory = useMemo(() => {
    if (!selected) return [];
    const base = clamp(Number(selected.development_score ?? 50), 0, 100);
    return [
      clamp(base - 20, 0, 100),
      clamp(base - 14, 0, 100),
      clamp(base - 8, 0, 100),
      clamp(base - 3, 0, 100),
      clamp(base, 0, 100),
    ];
  }, [selected]);

  const riskHistory = useMemo(() => {
    if (!selected) return [];
    const base = clamp(Number(selected.risk_score ?? 50), 0, 100);
    return [
      clamp(base + 8, 0, 100),
      clamp(base + 5, 0, 100),
      clamp(base + 3, 0, 100),
      clamp(base + 1, 0, 100),
      clamp(base, 0, 100),
    ];
  }, [selected]);

  if (loading) return <div style={{ padding: 24 }}>Yükleniyor...</div>;
  if (propertiesLoading) return <div style={{ padding: 24 }}>Veriler yükleniyor...</div>;

  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Terron • Dashboard</h1>
        <p>Giriş yapılmamış.</p>
        <button onClick={() => router.replace("/login")}>Giriş sayfasına git</button>
      </div>
    );
  }

  return (
    <AppShell>
    <div style={{ position: "absolute", inset: 0, background: "#070B14", color: "white" }}>
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: TOPBAR_H,
            bottom: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 40,
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: TOPBAR_H,
          left: 0,
          height: `calc(100vh - ${TOPBAR_H}px)`,
          width: 380,
          maxWidth: "92vw",
          zIndex: 50,
          transform: panelOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms ease",
          background: "rgba(8,12,22,0.96)",
          borderRight: "1px solid rgba(255,255,255,0.10)",
          padding: 16,
          overflowY: "auto",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.6 }}>Filtreler</div>
          <button onClick={() => setPanelOpen(false)} style={{ ...btnGhost, padding: "8px 10px" }}>
            ✕
          </button>
        </div>

        <div style={{ position: "relative", marginTop: 14 }}>
          <span
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.75, fontSize: 14 }}
          >
            🔎
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Ara... (adres, il, ilçe, parsel, ada)"
            style={{
              width: "100%",
              height: 40,
              padding: "0 12px 0 36px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              outline: "none",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.75 }}>Bölge Özeti</div>
          <div style={{ fontSize: 16, fontWeight: 1000, marginTop: 6 }}>{selectedAreaLabel}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={metricBox}>
              <div style={metricLabel}>Arsa Sayısı</div>
              <div style={metricValue}>{formatNumber(regionSummary.count)}</div>
            </div>
            <div style={metricBox}>
              <div style={metricLabel}>Ort. ₺/m²</div>
              <div style={metricValue}>₺{formatTRY(regionSummary.avgPricePerM2)}</div>
            </div>
            <div style={metricBox}>
              <div style={metricLabel}>Toplam m²</div>
              <div style={metricValue}>{formatNumber(Math.round(regionSummary.totalArea))}</div>
            </div>
            <div style={metricBox}>
              <div style={metricLabel}>Kalan m²</div>
              <div style={metricValue}>{formatNumber(Math.round(regionSummary.availableArea))}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>İl</div>
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setDistrict("");
              setNeighborhood("");
            }}
            style={selectStyle}
          >
            <option value="">Tümü</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>İlçe</div>
          <select
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setNeighborhood("");
            }}
            disabled={!city}
            style={{ ...selectStyle, opacity: city ? 1 : 0.55 }}
          >
            <option value="">{city ? "Tümü" : "Önce il seç"}</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>Mahalle</div>
          <select
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            disabled={!district}
            style={{ ...selectStyle, opacity: district ? 1 : 0.55 }}
          >
            <option value="">{district ? "Tümü" : "Önce ilçe seç"}</option>
            {neighborhoods.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Risk</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button onClick={() => setRiskBand(riskBand === "low" ? "" : "low")} style={chip(riskBand === "low")}>
              Düşük
            </button>
            <button onClick={() => setRiskBand(riskBand === "mid" ? "" : "mid")} style={chip(riskBand === "mid")}>
              Orta
            </button>
            <button
              onClick={() => setRiskBand(riskBand === "high" ? "" : "high")}
              style={chip(riskBand === "high")}
            >
              Yüksek
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Trend (Son 30 gün)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button
              onClick={() => setTrendBand(trendBand === "rising" ? "" : "rising")}
              style={chip(trendBand === "rising")}
            >
              Yükselen
            </button>
            <button onClick={() => setTrendBand(trendBand === "flat" ? "" : "flat")} style={chip(trendBand === "flat")}>
              Sabit
            </button>
            <button
              onClick={() => setTrendBand(trendBand === "falling" ? "" : "falling")}
              style={chip(trendBand === "falling")}
            >
              Düşen
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Satış ₺/m² (filtre)</div>
          <select value={priceBand} onChange={(e) => setPriceBand(e.target.value as PriceBand)} style={selectStyle}>
            <option value="">Tümü</option>
            <option value="0-10000">0 – 10.000 ₺/m²</option>
            <option value="10001-25000">10.001 – 25.000 ₺/m²</option>
            <option value="25001-50000">25.001 – 50.000 ₺/m²</option>
            <option value="50001-100000">50.001 – 100.000 ₺/m²</option>
            <option value="100001+">100.000+ ₺/m²</option>
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>İmar Durumu</div>
          <select value={zoning} onChange={(e) => setZoning(e.target.value as ZoningBand)} style={selectStyle}>
            <option value="">Tümü</option>
            <option value="imarli">İmarlı</option>
            <option value="imarsiz">İmarsız</option>
            <option value="bilinmiyor">Bilinmiyor</option>
            <option value="mixed">Karma / çeşitli</option>
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Toplam m²</div>
          <select value={areaBand} onChange={(e) => setAreaBand(e.target.value as AreaBand)} style={selectStyle}>
            <option value="">Tümü</option>
            <option value="0-500">0 – 500 m²</option>
            <option value="501-2000">501 – 2.000 m²</option>
            <option value="2001-10000">2.001 – 10.000 m²</option>
            <option value="10001+">10.000+ m²</option>
          </select>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              setCity("");
              setDistrict("");
              setNeighborhood("");
              setRiskBand("");
              setTrendBand("");
              setPriceBand("");
              setZoning("");
              setAreaBand("");
              setSelected(null);
              setBuyInProgress(false);
            }}
            style={{ ...btnGhost, flex: 1 }}
          >
            Temizle
          </button>
          <button onClick={() => setPanelOpen(false)} style={{ ...btnOutline, flex: 1 }}>
            Uygula
          </button>
        </div>

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.75 }}>Öne Çıkan Arsalar</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {regionList.map((p) => {
            const pPrice = getTerronSalePricePerM2(p, userId ?? "global");
            const pAvailable = getPropertyAvailableM2(p);

            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(selectPropertyForPanel(p));
                  setPanelOpen(false);
                }}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 14,
                  background: selected?.id === p.id ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
                  border:
                    selected?.id === p.id
                      ? "1px solid rgba(255,255,255,0.18)"
                      : "1px solid rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.neighborhood || p.district || p.city}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {p.city}
                      {p.district ? ` / ${p.district}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 1000 }}>₺{formatTRY(pPrice)}</div>
                    <div style={{ fontSize: 11, opacity: 0.72 }}>/m²</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
                  Kalan {formatNumber(Math.round(pAvailable))} m² • Risk %{Math.round(p.risk_score)} • Gelişim %
                  {Math.round(p.development_score)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <section style={{ position: "absolute", inset: 0 }}>
        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            style={{
              position: "absolute",
              left: 0,
              top: headerH + 22,
              zIndex: 25,
              width: 24,
              height: 74,
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              background: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderLeft: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(10px)",
            }}
            aria-label="Filtreleri aç"
            title="Filtreler"
          >
            <span style={{ opacity: 0.92, fontSize: 14 }}>⟫</span>
          </button>
        )}

        <div style={{ position: "absolute", left: 0, right: 0, top: headerH, bottom: 0 }}>
          <MapViewV2
            items={mapItemsForView}
            onSelectPropertyId={(id: string) => {
              const k = String(id).trim();
              let found =
                items.find((x) => samePropertyIdLoose(x.id, k)) ??
                filteredItems.find((x) => samePropertyIdLoose(x.id, k)) ??
                null;
              if (!found) {
                const ll = parseSyntheticLlId(k);
                if (ll) {
                  found = findPropertyForMapSelection({
                    id: k,
                    propertyId: undefined,
                    title: "",
                    city: "",
                    district: null,
                    neighborhood: null,
                    latitude: ll.lat,
                    longitude: ll.lng,
                  });
                  if (!found) {
                    setSelected(
                      selectPropertyForPanel(
                        propertyFromMapFallback({
                          id: k,
                          title: "Arsa",
                          city: "—",
                          district: null,
                          neighborhood: null,
                          latitude: ll.lat,
                          longitude: ll.lng,
                        }),
                      ),
                    );
                    return;
                  }
                }
              }
              setSelected(selectPropertyForPanel(found));
            }}
            onOpenInfo={() => undefined}
            onPropertyClick={(p: MapItemPayload) => {
              const found = findPropertyForMapSelection(p);
              if (found) {
                setSelected(selectPropertyForPanel(found));
                setPanelOpen(false);
                return;
              }
              const fromPayload = propertyFromMapItemPayload(p);
              if (fromPayload) {
                setSelected(fromPayload);
                setPanelOpen(false);
                return;
              }
              setSelected(selectPropertyForPanel(propertyFromMapFallback(p)));
              setPanelOpen(false);
            }}
            onOpenPropertyPanel={() => {
              setPanelOpen(false);
            }}
          />
        </div>

        {selected && (
          <>
            {isMobile && (
              <div
                onClick={() => {
                  setSelected(null);
                  setBuyInProgress(false);
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  top: headerH,
                  background: "rgba(0,0,0,0.28)",
                  zIndex: 11,
                }}
              />
            )}

            <div
              style={{
                position: "absolute",
                zIndex: 12,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 18px 55px rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(14px)",
                ...(isMobile
                  ? {
                      left: 10,
                      right: 10,
                      bottom: 10,
                      top: "auto",
                      height: "62vh",
                      maxHeight: "62vh",
                      borderRadius: 22,
                    }
                  : {
                      right: 16,
                      top: headerH + 12,
                      width: 320,
                      height: `calc(100vh - ${headerH + 24}px)`,
                      maxHeight: `calc(100vh - ${headerH + 24}px)`,
                      borderRadius: 18,
                    }),
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 10px",
                  borderBottom: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.88, fontWeight: 900, letterSpacing: 0.4 }}>
                  İlan detayı
                </div>
                <button
                  onClick={() => {
                    setSelected(null);
                    setBuyInProgress(false);
                  }}
                  style={smallGhostBtn}
                  title="Kapat"
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: "8px 10px 10px",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingBottom: 8,
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {showListedProperty(selected) ? (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 900,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: "rgba(245,215,110,0.14)",
                          border: "1px solid rgba(245,215,110,0.4)",
                        }}
                      >
                        Yayında
                      </span>
                      {selected.is_verified ? (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 900,
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: "rgba(56,189,248,0.12)",
                            border: "1px solid rgba(56,189,248,0.4)",
                          }}
                        >
                          Doğrulandı
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.25,
                      maxHeight: "2.5em",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {selected.title?.trim() ||
                      selected.neighborhood ||
                      selected.district ||
                      selected.city}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.72, lineHeight: 1.3 }}>
                    {selected.city}
                    {selected.district ? ` · ${selected.district}` : ""}
                    {selected.neighborhood ? ` · ${selected.neighborhood}` : ""}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.65 }}>
                      Toplam <b>{formatNumber(selected.total_area_m2)}</b> m²
                      {selected.zoning_status ? (
                        <span style={{ marginLeft: 6, opacity: 0.55, fontSize: 9 }} title={String(selected.zoning_status)}>
                          · {String(selected.zoning_status)}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.02, whiteSpace: "nowrap" }}>
                      ₺{formatTRY(selectedPricePerM2 * Number(selected.total_area_m2 ?? 0))}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {(
                    [
                      ["Gelişim", `%${formatInt(selected.development_score)}`],
                      ["Risk", `%${formatInt(selected.risk_score)}`],
                      ["30 gün", `${signedPct(selected.last_30d_change)}%`],
                      ["Beklenti", `%${Number(selected.expected_annual_return ?? 0).toFixed(1)}`],
                      ["₺/m²", `₺${formatTRY(selectedPricePerM2)}`],
                      ["Doluluk", `%${Math.round(listingDemandRatio * 100)}`],
                      [
                        "Likidite",
                        typeof selected.liquidity_score === "number" && Number.isFinite(selected.liquidity_score)
                          ? `%${formatInt(selected.liquidity_score)}`
                          : "—",
                      ],
                      [
                        "İmar",
                        selected.zoning_status
                          ? String(selected.zoning_status).length > 28
                            ? `${String(selected.zoning_status).slice(0, 26)}…`
                            : String(selected.zoning_status)
                          : "—",
                      ],
                      ["Arazi", selected.land_type?.trim() ? String(selected.land_type) : "—"],
                    ] as const
                  ).map(([label, val]) => (
                    <div
                      key={label}
                      style={{
                        padding: "6px 6px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ fontSize: 9, opacity: 0.62, fontWeight: 700, letterSpacing: 0.2 }}>{label}</div>
                      <div
                        style={{
                          fontSize: label === "İmar" ? 10 : 12,
                          fontWeight: 900,
                          marginTop: 2,
                          lineHeight: 1.25,
                          wordBreak: "break-word",
                        }}
                        title={label === "İmar" && selected.zoning_status ? String(selected.zoning_status) : undefined}
                      >
                        {val}
                      </div>
                    </div>
                  ))}
                </div>

                {selected.investment_thesis ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 8px",
                      borderRadius: 12,
                      background: "rgba(245,215,110,0.07)",
                      border: "1px solid rgba(245,215,110,0.22)",
                    }}
                  >
                    <div style={{ fontSize: 9, opacity: 0.72, fontWeight: 800, letterSpacing: 0.3 }}>Yatırım tezi</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, lineHeight: 1.4, opacity: 0.92 }}>
                      {selected.investment_thesis}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => setActiveInsightTab("arsa")}
                    style={{ ...tabBtn(activeInsightTab === "arsa"), padding: "6px 6px", fontSize: 11 }}
                  >
                    Arsa
                  </button>
                  <button
                    onClick={() => setActiveInsightTab("gelisim")}
                    style={{ ...tabBtn(activeInsightTab === "gelisim"), padding: "6px 6px", fontSize: 11 }}
                  >
                    Gelişim
                  </button>
                  <button
                    onClick={() => setActiveInsightTab("risk")}
                    style={{ ...tabBtn(activeInsightTab === "risk"), padding: "6px 6px", fontSize: 11 }}
                  >
                    Risk
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    maxHeight: "min(200px, 30vh)",
                    overflowY: "auto",
                  }}
                >
                  {activeInsightTab === "arsa" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selected.ai_summary ? (
                        <div
                          style={{
                            fontSize: 11,
                            lineHeight: 1.45,
                            padding: 8,
                            borderRadius: 10,
                            background: "rgba(245,215,110,0.08)",
                            border: "1px solid rgba(245,215,110,0.2)",
                          }}
                        >
                          <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>
                            Yatırım özeti
                          </div>
                          {selected.ai_summary}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.45 }}>
                        Ada/Parsel:{" "}
                        {selected.ada_no || selected.parcel_no
                          ? `${selected.ada_no ?? "—"} / ${selected.parcel_no ?? "—"}`
                          : "—"}{" "}
                        · İmar: {selected.zoning_status || "—"}
                        <br />
                        Kalan <b>{formatNumber(Math.round(selectedAvailableM2))}</b> m² · Satılan{" "}
                        <b>{formatNumber(Math.round(selectedSoldM2))}</b> m²
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>Etrafında</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>
                            {selected.around_text?.trim() ? selected.around_text : inferNearbyText(selected)}
                          </div>
                        </div>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>Özet</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>
                            {selected.summary_line?.trim() ? selected.summary_line : inferLandSummary(selected)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeInsightTab === "gelisim" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selected.growth_story ? (
                        <div style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.45 }}>{selected.growth_story}</div>
                      ) : null}
                      <div style={{ fontSize: 11, opacity: 0.82, lineHeight: 1.45 }}>
                        Gelişim <b>%{formatInt(selected.development_score)}</b> — ivme ve yerleşim baskısı birlikte okunur.
                      </div>

                      <MiniBars title="Son 5 Yıl Gelişim" values={developmentHistory} suffix="%" />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>Neden gelişiyor?</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4 }}>{inferGrowthReason(selected)}</div>
                        </div>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>İmar etkisi</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4 }}>{inferZoningImpact(selected)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeInsightTab === "risk" && (
                    <div style={{ display: "grid", gap: 8 }}>
                      {selected.risk_factors ? (
                        <div style={{ fontSize: 11, opacity: 0.9, lineHeight: 1.45 }}>{selected.risk_factors}</div>
                      ) : null}
                      <div style={{ fontSize: 11, opacity: 0.82, lineHeight: 1.45 }}>
                        Risk <b>%{formatInt(selected.risk_score)}</b> — likidite ve imar belirsizliği birlikte değerlendirilir.
                      </div>

                      <MiniBars title="Son 5 Yıl Risk" values={riskHistory} suffix="%" />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>Likidite</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4 }}>{inferLiquidityText(selected)}</div>
                        </div>
                        <div style={{ ...miniInfoCard, padding: 8 }}>
                          <div style={{ ...miniInfoLabel, fontSize: 9 }}>Belirsizlik</div>
                          <div style={{ ...miniInfoText, fontSize: 11, marginTop: 4 }}>{inferRiskText(selected)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>Doluluk</span>
                    <span style={{ fontSize: 11, fontWeight: 900 }}>{soldPct.toFixed(1)}%</span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      height: 5,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.07)",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, soldPct))}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, rgba(245,215,110,0.85), rgba(245,215,110,0.95))",
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.65, lineHeight: 1.35 }}>
                    Kalan {formatNumber(Math.round(selectedAvailableM2))} m² · Min. alım {formatNumber(selectedMinBuyM2)} m²
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.88, letterSpacing: 0.4 }}>Alım</div>
                  <div style={{ fontSize: 9, opacity: 0.62, marginTop: 2, lineHeight: 1.35 }}>
                    Alım komisyonu brüt arsa tutarı üzerinden %0,5; toplam ödeneğe eklenir
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
                    Talep {(selectedDemandPressure * 100).toFixed(0)}% · Bakiye{" "}
                    <b>₺{formatTRY(Math.round(walletBalance ?? 0))}</b>
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.72, marginTop: 4, lineHeight: 1.45 }}>
                    Satış tutarı <b>₺{formatTRY(selectedPricePerM2)}</b> /m²
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.72, marginTop: 2 }}>
                    Min {formatNumber(selectedMinBuyM2)} m² · Max{" "}
                    {formatNumber(Math.round(Math.min(selectedAvailableM2, selectedMaxBuyM2)))} m²
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                    <div>
                      <div style={{ ...tinyLabel, marginBottom: 4 }}>m²</div>
                      <input
                        type="number"
                        value={buyM2}
                        min={0}
                        step={0.01}
                        onChange={(e) => syncBuyFromM2(Number(e.target.value), selected)}
                        style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
                        placeholder="m²"
                      />
                    </div>
                    <div>
                      <div style={{ ...tinyLabel, marginBottom: 4 }}>Arsa tutarı (₺)</div>
                      <input
                        type="number"
                        value={buyBudget}
                        min={0}
                        step={1}
                        onChange={(e) => syncBuyFromBudget(Number(e.target.value), selected)}
                        style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
                        placeholder="Brüt"
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      padding: 8,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 6 }}>Alım özeti</div>
                    <div style={{ fontSize: 9, opacity: 0.55, marginBottom: 6 }}>
                      Satış tutarı ₺{formatTRY(selectedQuote?.salePricePerM2 ?? 0)}/m² × {formatDecimal(selectedDisplayM2 || selectedMinBuyM2)} m²
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                        fontSize: 11,
                        opacity: 0.92,
                        lineHeight: 1.4,
                      }}
                    >
                      <span>Arsa tutarı</span>
                      <span style={{ textAlign: "right", fontWeight: 800 }}>
                        ₺{formatTRY(Math.round(selectedQuote?.grossAssetValue ?? 0))}
                      </span>
                      <span>Alım komisyonu (%0,5)</span>
                      <span style={{ textAlign: "right", fontWeight: 800 }}>
                        ₺{formatTRY(Math.round(selectedQuote?.buyFee ?? 0))}
                      </span>
                      <span>Toplam ödenecek</span>
                      <span style={{ textAlign: "right", fontWeight: 950 }}>
                        ₺{formatTRY(Math.round(selectedTotalCost))}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "flex-end",
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        gap: 8,
                      }}
                    >
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, opacity: 0.65 }}>m²</div>
                        <div style={{ fontSize: 15, fontWeight: 1000, marginTop: 2 }}>{formatDecimal(selectedDisplayM2)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 9, opacity: 0.58, marginTop: 6, lineHeight: 1.35 }}>
                      Min. maliyet ₺{formatTRY(Math.round(selectedMinBuyCost))} · Tek sefer üst limit{" "}
                      {formatNumber(Math.round(Math.min(selectedAvailableM2, selectedMaxBuyM2)))} m²
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                    <button type="button" style={{ ...neutralActionBtn, padding: "10px 8px", fontSize: 12 }} onClick={addSelectedToCart}>
                      Sepete ekle
                    </button>
                    <button
                      type="button"
                      title={buyInProgress ? "İşlem sürüyor" : "Satın Al"}
                      style={{
                        ...neutralActionBtn,
                        padding: "10px 8px",
                        fontSize: 12,
                        fontWeight: 950,
                        opacity: buyInProgress ? 0.55 : 1,
                        cursor: buyInProgress ? "not-allowed" : "pointer",
                      }}
                      disabled={buyInProgress}
                      onClick={() => {
                        setKeypadStr(String(buyM2 || 0));
                        setKeypadOpen(true);
                      }}
                    >
                      Satın Al
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 950 }}>Sepet</div>
                      <div style={{ fontSize: 10, opacity: 0.72, marginTop: 2 }}>
                        {cart.length} kalem ·{" "}
                        <span style={{ color: "#F5D76E" }}>₺{formatTRY(Math.round(cartTotal()))}</span>
                      </div>
                    </div>
                    <button type="button" onClick={clearCart} style={{ ...smallGhostBtn, padding: "6px 8px", fontSize: 11 }}>
                      Temizle
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 100,
                      overflow: "auto",
                    }}
                  >
                    {cart.length === 0 ? (
                      <div style={{ fontSize: 10, opacity: 0.65 }}>Sepet boş.</div>
                    ) : (
                      cart.slice(0, 30).map((it) => (
                        <div
                          key={it.key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto auto",
                            gap: 6,
                            alignItems: "center",
                            padding: "6px 8px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 800,
                                fontSize: 10,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {it.property.city}
                              {it.property.district ? ` / ${it.property.district}` : ""}
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                              Arsa ₺{formatNumber(Math.round(it.grossAssetValue))} + kom. %0,5 ₺
                              {formatNumber(Math.round(it.buyFee))}
                            </div>
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 10, whiteSpace: "nowrap", textAlign: "right" }}>
                            <div style={{ fontSize: 8, opacity: 0.6 }}>Toplam</div>
                            ₺{formatNumber(Math.round(it.totalPaid))}
                          </div>
                          <button type="button" onClick={() => removeFromCart(it.key)} style={{ ...smallGhostBtn, padding: "4px 6px" }} title="Çıkar">
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCheckoutCart()}
                    disabled={checkingOut || cart.length === 0}
                    style={{
                      marginTop: 8,
                      width: "100%",
                      padding: "10px 10px",
                      borderRadius: 12,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "white",
                      fontWeight: 950,
                      fontSize: 12,
                      cursor: checkingOut || cart.length === 0 ? "not-allowed" : "pointer",
                      opacity: checkingOut || cart.length === 0 ? 0.55 : 1,
                    }}
                  >
                    Sepeti onayla
                  </button>
                </div>
              </div>
            </div>

            {keypadOpen && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 200,
                  background: "rgba(12,20,38,0.92)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={() => setKeypadOpen(false)}
                    aria-label="Kapat"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                      color: "white",
                      fontSize: 15,
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{selected.title} alış</div>
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                      Piyasa fiyatı: ₺{formatTRY(Math.round(selectedPricePerM2))}/m²
                    </div>
                  </div>
                  <div style={{ width: 32 }} />
                </div>

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, letterSpacing: 0.5 }}>
                    M² MİKTARI
                  </div>
                  <div style={{ fontSize: 52, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {keypadStr}
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
                    Tutar: ₺{formatTRY(Math.round(selectedTotalCost))}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.45, marginTop: 14 }}>
                    ₺{formatTRY(Math.round(walletBalance ?? 0))} alım gücü
                  </div>
                  <button
                    onClick={() => void reviewAndBuyFromKeypad()}
                    disabled={buyInProgress}
                    style={{
                      marginTop: 20,
                      padding: "14px 40px",
                      borderRadius: 16,
                      border: "none",
                      background: "linear-gradient(135deg, #e8d48a, #c9a227)",
                      color: "#0a0f1a",
                      fontWeight: 900,
                      fontSize: 14,
                      cursor: buyInProgress ? "not-allowed" : "pointer",
                      opacity: buyInProgress ? 0.6 : 1,
                    }}
                  >
                    {buyInProgress ? "İşleniyor…" : "Emri gözden geçir"}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    flexShrink: 0,
                  }}
                >
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
                    <button
                      key={k}
                      onClick={() => pressKeypadKey(k)}
                      style={{
                        padding: "16px 0",
                        fontSize: 20,
                        fontWeight: 700,
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.05)",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
    </AppShell>
  );
}

function MiniBars(props: { title: string; values: number[]; suffix?: string }) {
  const { title, values, suffix = "" } = props;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.88, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {values.map((v, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 36px", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 9, opacity: 0.65 }}>{2021 + i}</div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, v))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, rgba(245,215,110,0.75), rgba(245,215,110,0.95))",
                }}
              />
            </div>
            <div style={{ fontSize: 9, textAlign: "right", opacity: 0.85 }}>
              {formatInt(v)}
              {suffix}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function panelZoningBand(p: Property): ReturnType<typeof deriveZoningBandFromLabel> {
  const raw = String(p.zoning_band ?? "").trim();
  if (raw === "imarli" || raw === "imarsiz" || raw === "bilinmiyor" || raw === "mixed") {
    return raw;
  }
  return deriveZoningBandFromLabel(String(p.zoning_status ?? ""));
}

function inferNearbyText(p: Property) {
  const band = panelZoningBand(p);
  const isMetroCity = ["İstanbul", "Ankara", "İzmir", "Bursa", "Kocaeli", "Antalya"].includes(p.city);
  if (band === "imarli") {
    return isMetroCity
      ? "Ana yol bağlantısı, yerleşim aksı, ticaret alanı ve toplu ulaşım etkisi"
      : "Yerleşim genişleme yönü, yol bağlantısı ve orta yoğunluklu yapılaşma etkisi";
  }
  if (band === "imarsiz") {
    return isMetroCity
      ? "Açık tarım / düşük yoğunluklu çevre; imar açılımı ve plan değişikliği belirleyici olabilir"
      : "Kırsal çevre hattı; yerleşim ve ulaşım bağlantısı potansiyeli ile birlikte imar belirsizliği yüksek";
  }
  if (band === "mixed") {
    return "Karma kullanım veya kademeli dönüşüm bölgesi; çevrede konut, tarım veya ticaret etkisi birlikte görülebilir.";
  }
  return isMetroCity
    ? "Konum ve imar bilgisini tapu ve mevcut plan ile teyit etmek gerekir."
    : "İmar ve planlama durumu yerinde netleştirilmelidir.";
}

function inferLandSummary(p: Property) {
  const band = panelZoningBand(p);
  if (band === "imarli") return "İmarlı yapılaşma hakkı olan parsellerde işlem süreçleri genelde daha öngörülebilirdir.";
  if (band === "imarsiz") return "İmar ve planlama belirsizliği daha yüksek; süreç ve maliyet yerinde netleştirilmelidir.";
  if (band === "mixed") return "Karma veya geçiş bölgesi; mevzuat ve çevre projeleri fiyatı belirler.";
  if ((p.development_score ?? 0) > 70) return "Bölgesel gelişim göstergeleri güçlü; detaylar için yerinde keşif önerilir.";
  return "İmar ve planlama durumu yerinde kontrol edilmelidir.";
}

function inferGrowthReason(p: Property) {
  if ((p.development_score ?? 0) >= 75) return "Yeni yerleşim baskısı, altyapı erişimi ve fiyat ivmesi güçlü";
  if ((p.development_score ?? 0) >= 55) return "Yerleşim genişlemesi ve yol erişimi ile kademeli değer artışı";
  return "Gelişim erken aşamada, çevresel genişleme etkisi zamana yayılır";
}

function inferZoningImpact(p: Property) {
  const band = panelZoningBand(p);
  if (band === "imarli") return "İmarlı yapılaşma hakkı nedeniyle fiyat keşfi genelde daha hızlı olur";
  if (band === "imarsiz") return "İmar açılımı gerçekleşirse fiyat çarpanı belirgin yükseliş gösterebilir; süre belirsiz.";
  if (band === "mixed") return "Karma sınıflarda plan değişiklikleri ve çevre projeleri fiyatı belirler.";
  return "İmar sınıfı netleştikçe değerleme güveni artar.";
}

function inferLiquidityText(p: Property) {
  const liq = p.liquidity_score;
  if (typeof liq === "number" && Number.isFinite(liq)) {
    if (liq >= 72) return `Likidite skoru yüksek (${liq}); parçalı satış ve alıcı derinliği genelde daha iyi.`;
    if (liq >= 45) return `Likidite skoru orta (${liq}); işlem süresi bölge ortalamasına yakın olabilir.`;
    return `Likidite skoru düşük (${liq}); alıcı profili dar ve işlem süresi uzayabilir.`;
  }
  if (panelZoningBand(p) === "imarli" && (p.risk_score ?? 0) < 45) return "Parçalı satış kolaylığı yüksek";
  if ((p.risk_score ?? 0) < 65) return "Parçalı satış kolaylığı orta seviyede";
  return "Talep döngüsüne daha duyarlı, likidite daha yavaş olabilir";
}

function inferRiskText(p: Property) {
  const band = panelZoningBand(p);
  if (band === "imarsiz") return "İmar ve planlama belirsizliği daha yüksek izlenmeli";
  if (band === "mixed") return "Karma sınıflarda mevzuat ve çevre etkileri riski artırabilir.";
  if ((p.risk_score ?? 0) > 70) return "Piyasa döngüsü ve fiyat dalgalanması dikkatle takip edilmeli";
  return "Genel piyasa oynaklığı dışında kontrollü risk profili";
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function formatTRY(n: number) {
  try {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

function formatNumber(n: number) {
  try {
    return new Intl.NumberFormat("tr-TR").format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

function formatDecimal(n: number) {
  try {
    return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return String(n);
  }
}

function formatCompactChip(n: number) {
  const val = Number(n || 0);
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return formatNumber(val);
}

function formatInt(n: number | null | undefined) {
  return String(Math.round(Number(n ?? 0)));
}

function signedPct(n: number | null | undefined) {
  const x = Number(n ?? 0);
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
}

const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.72, marginBottom: 6 };
const tinyLabel: React.CSSProperties = { fontSize: 11, opacity: 0.72, marginBottom: 6 };

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  colorScheme: "dark",
  backgroundColor: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  outline: "none",
};

const btnGhost: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const btnOutline: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.18)",
  color: "white",
  fontSize: 13,
  fontWeight: 1000,
  cursor: "pointer",
};

const badgeBox: React.CSSProperties = {
  height: 40,
  padding: "8px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  lineHeight: 1.05,
};

const smallGhostBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const neutralActionBtn: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.16)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
    border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.10)",
    color: "white",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  };
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 12,
    background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.05)",
    border: active ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(255,255,255,0.10)",
    color: "white",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: 800,
  };
}

const metricBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const metricLabel: React.CSSProperties = { fontSize: 12, opacity: 0.7 };
const metricValue: React.CSSProperties = { fontSize: 18, fontWeight: 1000, marginTop: 4 };

const miniInfoCard: React.CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const miniInfoLabel: React.CSSProperties = { fontSize: 11, opacity: 0.7, fontWeight: 800 };
const miniInfoText: React.CSSProperties = { fontSize: 12, opacity: 0.9, marginTop: 6, lineHeight: 1.4 };
