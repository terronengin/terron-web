"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MapView from "../components/map/MapView";
import { supabase } from "../../lib/supabaseClient";
import { simulatePropertyPriceTRY } from "@/lib/sim/realEstatePrice";

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

type Property = {
  id: string;
  title: string;
  city: string;
  district: string | null;

  neighborhood?: string | null;
  zoning_status?: "imarli" | "imarsiz" | "bilinmiyor" | string | null;
  price_per_m2?: number | null;

  total_area_m2: number;

  risk_score: number;
  development_score: number;

  expected_annual_return: number;
  last_30d_change: number;

  latitude: number | null;
  longitude: number | null;

  quality_score?: number;
  rental_yield_annual?: number;
  total_shares?: number;

  area?: MarketArea | null;
};

type RiskBand = "" | "low" | "mid" | "high";
type TrendBand = "" | "rising" | "flat" | "falling";
type PriceBand =
  | ""
  | "0-10000"
  | "10001-25000"
  | "25001-50000"
  | "50001-100000"
  | "100001+";
type ZoningBand = "" | "imarli" | "imarsiz" | "bilinmiyor";
type AreaBand = "" | "0-500" | "501-2000" | "2001-10000" | "10001+";

const USE_DEMO_SEED_IF_EMPTY = true;
const DEMO_CITY_COUNT = 50;
const DEMO_PROPERTY_COUNT = 1500;

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);

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

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(1000);
  const [opening, setOpening] = useState(false);

  type CartItem = { key: string; property: Property; amount: number };
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);

  const [simDayOffset, setSimDayOffset] = useState<number>(0);
  const [ticking, setTicking] = useState(false);

  const INFO_OPEN_H = 720;
  const INFO_COLLAPSED_H = 86;
  const INFO_TRAVEL = INFO_OPEN_H - INFO_COLLAPSED_H;

  const [infoOpen, setInfoOpen] = useState(true);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; start: number } | null>(null);

  const HEADER_H = 64;

  function isDemoPropertyId(id: string) {
    return typeof id === "string" && id.startsWith("demo_");
  }

  type DemoPosition = {
    id: string;
    property_id: string;
    amount: number;
    entry_price: number;
    units: number;
    created_at: string;
    snapshot: {
      title?: string;
      city?: string;
      district?: string | null;
      neighborhood?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
  };

  function loadDemoPositions(): DemoPosition[] {
    try {
      const raw = localStorage.getItem("terron_demo_positions");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveDemoPositions(list: DemoPosition[]) {
    localStorage.setItem("terron_demo_positions", JSON.stringify(list));
  }

  function cartTotal() {
    return cart.reduce((s, x) => s + Number(x.amount || 0), 0);
  }

  function addSelectedToCart() {
    if (!selected) {
      alert("Önce bir mülk seç.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Yatırım miktarı geçersiz.");
      return;
    }

    setCart((prev) => [{ key: `${selected.id}_${Date.now()}`, property: selected, amount: amt }, ...prev]);
    alert("Sepete eklendi ✅");
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((x) => x.key !== key));
  }

  function clearCart() {
    setCart([]);
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

  async function load() {
    let q = supabase
      .from("properties")
      .select(
        `
        *,
        area:market_areas (
          id,
          name,
          city,
          district,
          base_m2_price,
          expected_real_return_annual,
          inflation_annual,
          vol_annual,
          cycle_strength,
          shock_prob_annual,
          shock_size
        )
      `
      )
      .order("created_at", { ascending: false });

    if (city) q = q.eq("city", city);
    if (district) q = q.eq("district", district);
    if (neighborhood) q = q.eq("neighborhood", neighborhood);

    if (riskBand) {
      if (riskBand === "low") q = q.lte("risk_score", 30);
      if (riskBand === "mid") q = q.gt("risk_score", 30).lte("risk_score", 70);
      if (riskBand === "high") q = q.gt("risk_score", 70);
    }

    if (trendBand === "rising") q = q.gte("last_30d_change", 10);
    if (trendBand === "flat") q = q.gte("last_30d_change", -3).lte("last_30d_change", 10);
    if (trendBand === "falling") q = q.lte("last_30d_change", -3);

    if (priceBand === "0-10000") q = q.gte("price_per_m2", 0).lte("price_per_m2", 10000);
    if (priceBand === "10001-25000") q = q.gte("price_per_m2", 10001).lte("price_per_m2", 25000);
    if (priceBand === "25001-50000") q = q.gte("price_per_m2", 25001).lte("price_per_m2", 50000);
    if (priceBand === "50001-100000") q = q.gte("price_per_m2", 50001).lte("price_per_m2", 100000);
    if (priceBand === "100001+") q = q.gte("price_per_m2", 100001);

    if (zoning) q = q.eq("zoning_status", zoning);

    if (areaBand === "0-500") q = q.gte("total_area_m2", 0).lte("total_area_m2", 500);
    if (areaBand === "501-2000") q = q.gte("total_area_m2", 501).lte("total_area_m2", 2000);
    if (areaBand === "2001-10000") q = q.gte("total_area_m2", 2001).lte("total_area_m2", 10000);
    if (areaBand === "10001+") q = q.gte("total_area_m2", 10001);

    const { data, error } = await q;
    if (error) {
      console.error(error);
      return;
    }

    const list = (data ?? []) as Property[];

    if (USE_DEMO_SEED_IF_EMPTY && list.length < 50) {
      const seeded = generateDemoProperties({
        countCities: DEMO_CITY_COUNT,
        countProps: DEMO_PROPERTY_COUNT,
        seed: 1337,
      });
      setItems(seeded);
      setSelected(seeded[0] ?? null);
      return;
    }

    setItems(list);
    setSelected(list[0] ?? null);
  }

  useEffect(() => {
    if (!email) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, city, district, neighborhood, riskBand, trendBand, priceBand, zoning, areaBand]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => {
      const blob = [p.title, p.id, p.city, p.district ?? "", p.neighborhood ?? "", p.zoning_status ?? ""]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [items, searchText]);

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

  async function logout() {
  const rememberPref =
    typeof window !== "undefined"
      ? localStorage.getItem("terron_remember_me")
      : null;

  let keepRemember = rememberPref === "true";

  if (typeof window !== "undefined") {
    keepRemember = window.confirm(
      "Bu cihazda girişin hatırlansın mı?\n\nTamam = Hatırla\nİptal = Unut"
    );

    localStorage.setItem("terron_remember_me", String(keepRemember));

    if (!keepRemember) {
      localStorage.removeItem("terron_saved_email");
    }
  }

  await supabase.auth.signOut();
  router.replace("/login");
}

  async function ensureAndLoadWallet() {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
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

  async function ensureAndLoadSimDay() {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, sim_day_offset: 0 }, { onConflict: "id" })
      .select("sim_day_offset")
      .single();

    if (error) {
      console.warn("[profiles] upsert/select error:", error);
      return;
    }

    setSimDayOffset(Number(data?.sim_day_offset ?? 0));
  }

  useEffect(() => {
    if (!email) return;
    ensureAndLoadWallet();
    ensureAndLoadSimDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function setSimDay(next: number) {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return;

    setTicking(true);
    const safe = Math.max(0, next);

    const { error } = await supabase.from("profiles").update({ sim_day_offset: safe }).eq("id", user.id);

    if (error) {
      alert("Sim gün güncellenemedi: " + error.message);
      setTicking(false);
      return;
    }

    setSimDayOffset(safe);
    setTicking(false);
  }

  function dayKeyWithOffset(offset: number) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function hash01(str: string) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = h >>> 0;
    return u / 4294967296;
  }

  function simulatePriceIndex(propertyId: string, annualReturnPct: number, basePrice = 100) {
    const t = dayKeyWithOffset(simDayOffset);
    const noise = (hash01(`${propertyId}:${t}`) - 0.5) * 0.04;
    const driftDaily = Math.pow(1 + annualReturnPct / 100, 1 / 365) - 1;

    const epoch = new Date("2026-01-01T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.floor((now.getTime() - epoch.getTime()) / 86400000) + simDayOffset);

    const drift = Math.pow(1 + driftDaily, days);
    const price = basePrice * drift * (1 + noise);
    return Math.max(1, price);
  }

  function getRealEstateSim(p: Property) {
    if (!p.area || !p.total_area_m2 || p.total_area_m2 <= 0) return null;

    const seedScope = userId ?? "global";

    const risk01 = clamp01((p.risk_score ?? 50) / 100);
    const dev01 = clamp01((p.development_score ?? 50) / 100);

    const quality01 =
      p.quality_score != null ? clamp01(p.quality_score) : clamp01(0.55 + dev01 * 0.2 - risk01 * 0.1);

    const rentalYield = p.rental_yield_annual != null ? clamp01(p.rental_yield_annual) : 0.05;

    const propertyForSim = {
      id: p.id,
      area_m2: Number(p.total_area_m2),
      quality_score: quality01,
      development_score: dev01,
      risk_score: risk01,
      rental_yield_annual: rentalYield,
      area: {
        id: p.area.id,
        base_m2_price: Number(p.area.base_m2_price),
        expected_real_return_annual: Number(p.area.expected_real_return_annual ?? 0.03),
        inflation_annual: Number(p.area.inflation_annual ?? 0.0),
        vol_annual: Number(p.area.vol_annual ?? 0.12),
        cycle_strength: Number(p.area.cycle_strength ?? 0.6),
        shock_prob_annual: Number(p.area.shock_prob_annual ?? 0.06),
        shock_size: Number(p.area.shock_size ?? -0.08),
      },
    };

    const out = simulatePropertyPriceTRY(propertyForSim as any, simDayOffset, seedScope);

    const totalShares = Number(p.total_shares ?? 100000);
    const sharePrice = out.price / Math.max(1, totalShares);

    return { ...out, sharePrice, totalShares };
  }

  async function handleOpenPosition() {
    try {
      if (!selected) {
        alert("Önce bir mülk seç.");
        return;
      }

      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        alert("Yatırım miktarı geçersiz.");
        return;
      }

      if (isDemoPropertyId(selected.id)) {
        const currentBalance = Number(walletBalance ?? 0);
        if (currentBalance < amt) {
          alert(`Yetersiz bakiye. Bakiye: ${formatNumber(currentBalance)} Çip`);
          return;
        }

        setOpening(true);

        const sim = getRealEstateSim(selected);
        let entryPrice: number;
        let units: number;

        if (sim) {
          entryPrice = sim.sharePrice;
          units = amt / entryPrice;
        } else {
          entryPrice = simulatePriceIndex(selected.id, Number(selected.expected_annual_return ?? 0), 100);
          units = amt / entryPrice;
        }

        setWalletBalance(currentBalance - amt);

        const list = loadDemoPositions();
        list.unshift({
          id: `demo_pos_${Date.now()}`,
          property_id: selected.id,
          amount: amt,
          entry_price: entryPrice,
          units,
          created_at: new Date().toISOString(),
          snapshot: {
            title: selected.title,
            city: selected.city,
            district: selected.district,
            neighborhood: selected.neighborhood,
            latitude: selected.latitude,
            longitude: selected.longitude,
          },
        });
        saveDemoPositions(list);

        alert("Demo pozisyon açıldı ✅ (DB’ye yazmadım)");
        setOpening(false);
        return;
      }

      setOpening(true);

      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!user) {
        alert("Giriş yapılmamış görünüyor. Tekrar login ol.");
        setOpening(false);
        return;
      }

      const { data: w, error: wErr } = await supabase
        .from("wallets")
        .select("user_id,balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wErr) {
        alert("Wallet okunamadı: " + wErr.message);
        setOpening(false);
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
          alert("Wallet oluşturulamadı: " + insErr.message);
          setOpening(false);
          return;
        }

        balance = Number(ins.balance);
      }

      if (balance < amt) {
        alert(`Yetersiz bakiye. Bakiye: ${formatNumber(balance)} Çip`);
        setWalletBalance(balance);
        setOpening(false);
        return;
      }

      const sim = getRealEstateSim(selected);

      let entryPrice: number;
      let units: number;

      if (sim) {
        entryPrice = sim.sharePrice;
        units = amt / entryPrice;
      } else {
        entryPrice = simulatePriceIndex(selected.id, Number(selected.expected_annual_return ?? 0), 100);
        units = amt / entryPrice;
      }

      const newBalance = balance - amt;

      const { error: upErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (upErr) {
        alert("Bakiye güncellenemedi: " + upErr.message);
        setOpening(false);
        return;
      }

      const payload = {
        user_id: user.id,
        property_id: selected.id,
        amount: amt,
        entry_price: entryPrice,
        units,
      };

      const { error: posErr } = await supabase.from("positions").insert(payload);

      if (posErr) {
        await supabase
          .from("wallets")
          .update({ balance: balance, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);

        alert("Pozisyon açılamadı: " + posErr.message);
        setOpening(false);
        return;
      }

      setWalletBalance(newBalance);
      alert("Pozisyon açıldı ✅");
      setOpening(false);
    } catch (e: any) {
      console.error("[POS] exception:", e);
      alert("Beklenmeyen hata: " + (e?.message ?? String(e)));
      setOpening(false);
    }
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
        alert(`Yetersiz bakiye. Bakiye: ${formatNumber(currentBalance)} Çip • Sepet: ${formatNumber(total)} Çip`);
        return;
      }

      setCheckingOut(true);

      const demoItems = cart.filter((x) => isDemoPropertyId(x.property.id));
      const realItems = cart.filter((x) => !isDemoPropertyId(x.property.id));

      if (demoItems.length > 0) {
        const list = loadDemoPositions();

        for (const it of demoItems) {
          const p = it.property;
          const amt = Number(it.amount);

          const sim = getRealEstateSim(p);
          let entryPrice: number;
          let units: number;

          if (sim) {
            entryPrice = sim.sharePrice;
            units = amt / entryPrice;
          } else {
            entryPrice = simulatePriceIndex(p.id, Number(p.expected_annual_return ?? 0), 100);
            units = amt / entryPrice;
          }

          list.unshift({
            id: `demo_pos_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
            property_id: p.id,
            amount: amt,
            entry_price: entryPrice,
            units,
            created_at: new Date().toISOString(),
            snapshot: {
              title: p.title,
              city: p.city,
              district: p.district,
              neighborhood: p.neighborhood,
              latitude: p.latitude,
              longitude: p.longitude,
            },
          });
        }

        saveDemoPositions(list);
      }

      if (realItems.length > 0) {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;

        if (!user) {
          alert("Giriş yapılmamış görünüyor. Tekrar login ol.");
          setCheckingOut(false);
          return;
        }

        const realTotal = realItems.reduce((s, x) => s + Number(x.amount || 0), 0);

        const { data: w, error: wErr } = await supabase
          .from("wallets")
          .select("user_id,balance")
          .eq("user_id", user.id)
          .maybeSingle();

        if (wErr) {
          alert("Wallet okunamadı: " + wErr.message);
          setCheckingOut(false);
          return;
        }

        const balanceDb = w?.balance != null ? Number(w.balance) : currentBalance;

        if (balanceDb < realTotal) {
          alert(`Yetersiz bakiye (DB). Bakiye: ${formatNumber(balanceDb)} Çip • Gerçek sepet: ${formatNumber(realTotal)} Çip`);
          setCheckingOut(false);
          return;
        }

        const newBalanceDb = balanceDb - realTotal;
        const { error: upErr } = await supabase
          .from("wallets")
          .update({ balance: newBalanceDb, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);

        if (upErr) {
          alert("Bakiye güncellenemedi: " + upErr.message);
          setCheckingOut(false);
          return;
        }

        const insertedIds: string[] = [];

        for (const it of realItems) {
          const p = it.property;
          const amt = Number(it.amount);

          const sim = getRealEstateSim(p);
          let entryPrice: number;
          let units: number;

          if (sim) {
            entryPrice = sim.sharePrice;
            units = amt / entryPrice;
          } else {
            entryPrice = simulatePriceIndex(p.id, Number(p.expected_annual_return ?? 0), 100);
            units = amt / entryPrice;
          }

          const payload = {
            user_id: user.id,
            property_id: p.id,
            amount: amt,
            entry_price: entryPrice,
            units,
          };

          const { data: ins, error: posErr } = await supabase
            .from("positions")
            .insert(payload)
            .select("id")
            .single();

          if (posErr) {
            await supabase
              .from("wallets")
              .update({ balance: balanceDb, updated_at: new Date().toISOString() })
              .eq("user_id", user.id);

            if (insertedIds.length > 0) {
              await supabase.from("positions").delete().in("id", insertedIds);
            }

            alert("Toplu alım sırasında hata: " + posErr.message);
            setCheckingOut(false);
            return;
          }

          if (ins?.id) insertedIds.push(String(ins.id));
        }
      }

      setWalletBalance(Math.max(0, currentBalance - total));
      clearCart();

      alert("Toplu alım tamam ✅");
      setCheckingOut(false);
    } catch (e: any) {
      console.error("[CART] exception:", e);
      alert("Beklenmeyen hata: " + (e?.message ?? String(e)));
      setCheckingOut(false);
    }
  }

  function openInfo() {
    setInfoOpen(true);
    setDragY(0);
  }
  function closeInfo() {
    setInfoOpen(false);
    setDragY(INFO_TRAVEL);
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);

    setDragging(true);
    dragStartRef.current = { y: e.clientY, start: dragY };
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStartRef.current) return;
    const dy = e.clientY - dragStartRef.current.y;
    const next = clamp(dragStartRef.current.start + dy, 0, INFO_TRAVEL);
    setDragY(next);
  }

  function onHandlePointerUp() {
    setDragging(false);
    dragStartRef.current = null;

    const threshold = INFO_TRAVEL * 0.45;
    if (dragY > threshold) closeInfo();
    else openInfo();
  }

  useEffect(() => {
    if (infoOpen) setDragY(0);
    else setDragY(INFO_TRAVEL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoOpen]);

  if (loading) return <div style={{ padding: 24 }}>Yükleniyor...</div>;

  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Terron • Dashboard</h1>
        <p>Giriş yapılmamış.</p>
        <button onClick={() => router.replace("/login")}>Giriş sayfasına git</button>
      </div>
    );
  }

  const selectedSim = selected ? getRealEstateSim(selected) : null;
  const selectedIndexFallback = selected
    ? simulatePriceIndex(selected.id, Number(selected.expected_annual_return ?? 0), 100)
    : 0;

  return (
    <div style={{ height: "100vh", background: "#070B14", color: "white", position: "relative" }}>
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: HEADER_H,
            bottom: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 40,
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: HEADER_H,
          left: 0,
          height: `calc(100vh - ${HEADER_H}px)`,
          width: 360,
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
            <button onClick={() => setRiskBand(riskBand === "high" ? "" : "high")} style={chip(riskBand === "high")}>
              Yüksek
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Trend (Son 30 gün)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <button onClick={() => setTrendBand(trendBand === "rising" ? "" : "rising")} style={chip(trendBand === "rising")}>
              Yükselen
            </button>
            <button onClick={() => setTrendBand(trendBand === "flat" ? "" : "flat")} style={chip(trendBand === "flat")}>
              Sabit
            </button>
            <button onClick={() => setTrendBand(trendBand === "falling" ? "" : "falling")} style={chip(trendBand === "falling")}>
              Düşen
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>m² Fiyat</div>
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
            }}
            style={{ ...btnGhost, flex: 1 }}
          >
            Temizle
          </button>
          <button onClick={() => setPanelOpen(false)} style={{ ...btnGold, flex: 1 }}>
            Uygula
          </button>
        </div>

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.75 }}>Envanter</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredItems.slice(0, 14).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p);
                setPanelOpen(false);
                openInfo();
              }}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 14,
                background: selected?.id === p.id ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)",
                border: selected?.id === p.id ? "1px solid rgba(212,175,55,0.25)" : "1px solid rgba(255,255,255,0.08)",
                color: "white",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800 }}>{p.city}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Gelişim {p.development_score}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{p.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Risk {p.risk_score} • Son30g {Number(p.last_30d_change ?? 0).toFixed(1)}%
              </div>
            </button>
          ))}
        </div>
      </div>

      <section style={{ position: "absolute", inset: 0 }}>
        <div
          style={{
            height: HEADER_H,
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 30,
            background: "linear-gradient(to bottom, rgba(10,14,24,0.92), rgba(10,14,24,0.65))",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 16px",
              maxWidth: 1600,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                minWidth: 170,
              }}
            >
              <div
                style={{
                  padding: "6px 20px",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #C9A227, #F5D76E, #B8860B)",
                  boxShadow: "0 0 20px rgba(212,175,55,0.35)",
                  color: "#111",
                  fontWeight: 1000,
                  letterSpacing: 2,
                  fontSize: 18,
                  textAlign: "center",
                  minWidth: 150,
                }}
              >
                TERRON
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  letterSpacing: 3,
                  fontWeight: 900,
                  color: "#E5C36A",
                  textAlign: "center",
                }}
              >
                CIVIL
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ width: "min(760px, 100%)", position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.75,
                    fontSize: 14,
                  }}
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
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setPanelOpen(true)} style={btnGhost}>
                Filtreler
              </button>

              <button onClick={() => router.push("/portfolio")} style={btnGhost}>
                Portföy
              </button>

              <div style={badgeBox}>
                <div style={{ fontSize: 11, opacity: 0.75 }}>Bakiye</div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  {walletBalance == null ? "—" : `${formatNumber(walletBalance)} Çip`}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                title={email ?? ""}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 1000,
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ opacity: 0.9 }}>{(displayName?.[0] ?? "A").toUpperCase()}</span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, minWidth: 110 }}>
                  <div style={{ fontSize: 13, fontWeight: 1000 }}>{displayName}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {(email ?? "").slice(0, 18)}
                    {(email ?? "").length > 18 ? "…" : ""}
                  </div>
                </div>

                <button onClick={logout} style={{ ...btnGhost, padding: "8px 10px" }}>
                  Çıkış
                </button>
              </div>
            </div>
          </div>
        </div>

        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            style={{
              position: "absolute",
              left: 0,
              top: HEADER_H + 22,
              zIndex: 25,
              width: 24,
              height: 74,
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              background: "rgba(10,14,24,0.55)",
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

        <div style={{ position: "absolute", left: 0, right: 0, top: HEADER_H, bottom: 0 }}>
          <MapView
            items={filteredItems
              .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
              .map((p) => ({
                id: p.id,
                title: p.title,
                city: p.city,
                district: p.district ?? null,
                neighborhood: p.neighborhood ?? null,
                latitude: Number(p.latitude),
                longitude: Number(p.longitude),
              }))}
            onSetCity={(c) => {
              setCity(c);
              setDistrict("");
              setNeighborhood("");
            }}
            onSetDistrict={(d) => {
              setDistrict(d);
              setNeighborhood("");
            }}
            onSetNeighborhood={(n) => setNeighborhood(n)}
            onSelectPropertyId={(id) => {
              const found = items.find((x) => x.id === id) || filteredItems.find((x) => x.id === id) || null;
              if (found) setSelected(found);
            }}
            onOpenInfo={() => openInfo()}
          />
        </div>

        {selected && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: 16,
              width: 320,
              height: INFO_OPEN_H,
              transform: `translateY(${dragY}px)`,
              transition: dragging ? "none" : "transform 220ms ease",
              borderRadius: 18,
              background: "rgba(10,14,24,0.58)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              zIndex: 12,
              overflow: "hidden",
              boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
            }}
          >
            <div
              onClick={() => setInfoOpen((v) => !v)}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              style={{
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                cursor: "grab",
                userSelect: "none",
              }}
              title="Aç / Kapat (sürükle)"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 6, borderRadius: 999, background: "rgba(255,255,255,0.22)" }} />
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900, letterSpacing: 0.5 }}>Detay Paneli</div>
              </div>

              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{infoOpen ? "Kapat ▾" : "Aç ▴"}</div>
            </div>

            <div
              style={{
                height: INFO_OPEN_H - 48,
                padding: 14,
                overflowY: infoOpen ? "auto" : "hidden",
              }}
              onClick={() => {
                if (!infoOpen) setInfoOpen(true);
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ lineHeight: 1.15 }}>
                  <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.3 }}>
                    {selected.neighborhood ? selected.neighborhood : selected.district ? selected.district : selected.city}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    {selected.city}
                    {selected.district && selected.neighborhood ? ` / ${selected.district}` : ""}
                    {" • "}
                    <b>{selected.total_area_m2}</b> m²
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Tahmini Değer</div>
                  <div style={{ fontSize: 18, fontWeight: 1100, letterSpacing: 0.2 }}>
                    {selectedSim ? `₺${formatTRY(selectedSim.price)}` : `${selectedIndexFallback.toFixed(2)}`}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                    {selected.zoning_status ? String(selected.zoning_status).toUpperCase() : "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div style={metricBox}>
                  <div style={metricLabel}>Gelişim</div>
                  <div style={metricValue}>{selected.development_score}</div>
                </div>
                <div style={metricBox}>
                  <div style={metricLabel}>Risk</div>
                  <div style={metricValue}>{selected.risk_score}</div>
                </div>
                <div style={metricBox}>
                  <div style={metricLabel}>Son 30 Gün</div>
                  <div style={metricValue}>{Number(selected.last_30d_change ?? 0).toFixed(1)}%</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>Sim</div>
                  <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>
                    {selectedSim ? (
                      <>
                        ₺{formatTRY(selectedSim.price)}
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          ₺/m²: ₺{formatTRY(selectedSim.pricePerM2)}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          Pay: ₺{formatTRY(selectedSim.sharePrice)}
                        </div>
                      </>
                    ) : (
                      <>
                        {selectedIndexFallback.toFixed(2)} <span style={{ fontSize: 12, opacity: 0.7 }}>(fallback)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input
                  type="number"
                  value={amount}
                  min={1}
                  step={100}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "white",
                    outline: "none",
                  }}
                  placeholder="Yatırım (Çip)"
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(212,175,55,0.14)",
                      border: "1px solid rgba(212,175,55,0.25)",
                      color: "white",
                      fontWeight: 1000,
                      cursor: "pointer",
                    }}
                    onClick={addSelectedToCart}
                  >
                    Sepete Ekle
                  </button>

                  <button
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: opening ? "rgba(16,185,129,0.10)" : "rgba(16,185,129,0.18)",
                      border: "1px solid rgba(16,185,129,0.28)",
                      color: "white",
                      fontWeight: 1000,
                      cursor: opening ? "not-allowed" : "pointer",
                      opacity: opening ? 0.7 : 1,
                    }}
                    disabled={opening}
                    onClick={handleOpenPosition}
                  >
                    {opening ? "Açılıyor..." : "Tekli Satın Al"}
                  </button>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ lineHeight: 1.1 }}>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>Sepet</div>
                      <div style={{ fontSize: 13, fontWeight: 1000 }}>
                        {cart.length} ürün • Toplam:{" "}
                        <span style={{ color: "#F5D76E" }}>{formatNumber(Math.round(cartTotal()))} Çip</span>
                      </div>
                    </div>

                    <button
                      onClick={clearCart}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                      title="Sepeti temizle"
                    >
                      Temizle
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflow: "auto" }}>
                    {cart.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Sepet boş. “Sepete Ekle” ile birden çok arsa biriktir.</div>
                    ) : (
                      cart.slice(0, 30).map((it) => (
                        <div
                          key={it.key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.10)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {it.property.city} {it.property.district ? ` / ${it.property.district}` : ""}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {it.property.title}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ fontWeight: 1000, fontSize: 12 }}>{formatNumber(Math.round(it.amount))} Çip</div>
                            <button
                              onClick={() => removeFromCart(it.key)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "white",
                                cursor: "pointer",
                                fontWeight: 900,
                              }}
                              title="Sepetten çıkar"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={handleCheckoutCart}
                    disabled={checkingOut || cart.length === 0}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      padding: 12,
                      borderRadius: 14,
                      background: checkingOut ? "rgba(16,185,129,0.10)" : "rgba(16,185,129,0.18)",
                      border: "1px solid rgba(16,185,129,0.28)",
                      color: "white",
                      fontWeight: 1100,
                      cursor: checkingOut || cart.length === 0 ? "not-allowed" : "pointer",
                      opacity: checkingOut || cart.length === 0 ? 0.65 : 1,
                    }}
                  >
                    {checkingOut ? "Toplu alınıyor..." : "Toplu Al (Sepeti Onayla)"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>Gün Kontrol</div>
                    <div style={{ fontSize: 14, fontWeight: 1000 }}>
                      Sim Gün: <span style={{ color: "#F5D76E" }}>{simDayOffset}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      disabled={ticking}
                      onClick={() => setSimDay(simDayOffset - 1)}
                      style={{ ...miniBtn, width: 34, height: 34, borderRadius: 12, opacity: ticking ? 0.6 : 1 }}
                      title="Gün azalt"
                    >
                      −
                    </button>
                    <button
                      disabled={ticking}
                      onClick={() => setSimDay(simDayOffset + 1)}
                      style={{ ...miniBtn, width: 34, height: 34, borderRadius: 12, opacity: ticking ? 0.6 : 1 }}
                      title="Gün artır"
                    >
                      +
                    </button>
                    <button
                      disabled={ticking}
                      onClick={() => setSimDay(0)}
                      style={{ ...miniBtn, width: 40, height: 34, borderRadius: 12, fontWeight: 1000, opacity: ticking ? 0.6 : 1 }}
                      title="Sıfırla"
                    >
                      0
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, opacity: 0.7, minWidth: 24 }}>0</span>
                  <input
                    type="range"
                    min={0}
                    max={365}
                    value={simDayOffset}
                    disabled={ticking}
                    onChange={(e) => setSimDay(Number(e.target.value))}
                    style={{ width: "100%", cursor: ticking ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ fontSize: 11, opacity: 0.7, minWidth: 36, textAlign: "right" }}>365</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
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
    return new Intl.NumberFormat("tr-TR").format(n);
  } catch {
    return String(n);
  }
}

const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.72, marginBottom: 6 };

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

const btnGold: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 14,
  background: "rgba(212,175,55,0.16)",
  border: "1px solid rgba(212,175,55,0.30)",
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

const miniBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
};

function chip(active: boolean): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 12,
    background: active ? "rgba(212,175,55,0.14)" : "rgba(255,255,255,0.05)",
    border: active ? "1px solid rgba(212,175,55,0.25)" : "1px solid rgba(255,255,255,0.10)",
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

function generateDemoProperties(opts: { countCities: number; countProps: number; seed: number }): Property[] {
  const rng = mulberry32(opts.seed);

  const citiesAll = [
    "İstanbul","Ankara","İzmir","Bursa","Antalya","Adana","Konya","Kocaeli","Gaziantep","Mersin",
    "Kayseri","Samsun","Eskişehir","Denizli","Tekirdağ","Sakarya","Balıkesir","Manisa","Aydın","Muğla",
    "Trabzon","Ordu","Giresun","Rize","Erzurum","Diyarbakır","Şanlıurfa","Malatya","Kahramanmaraş","Hatay",
    "Çanakkale","Edirne","Kırklareli","Yalova","Afyonkarahisar","Isparta","Burdur","Uşak","Kütahya","Bilecik",
    "Aksaray","Niğde","Sivas","Tokat","Çorum","Kastamonu","Zonguldak","Karabük","Düzce","Van",
    "Batman","Mardin","Siirt","Elazığ","Amasya","Kırşehir","Nevşehir","Çankırı","Yozgat","Gümüşhane"
  ];

  const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    "İstanbul": { lat: 41.0082, lng: 28.9784 },
    "Ankara": { lat: 39.9334, lng: 32.8597 },
    "İzmir": { lat: 38.4237, lng: 27.1428 },
    "Bursa": { lat: 40.195, lng: 29.06 },
    "Antalya": { lat: 36.8969, lng: 30.7133 },
    "Adana": { lat: 36.9914, lng: 35.3308 },
    "Konya": { lat: 37.8746, lng: 32.4932 },
    "Kocaeli": { lat: 40.7667, lng: 29.9167 },
    "Gaziantep": { lat: 37.0662, lng: 37.3833 },
    "Mersin": { lat: 36.8121, lng: 34.6415 },
    "Kayseri": { lat: 38.7225, lng: 35.4875 },
    "Samsun": { lat: 41.2867, lng: 36.33 },
    "Eskişehir": { lat: 39.7767, lng: 30.5206 },
    "Denizli": { lat: 37.7765, lng: 29.0864 },
    "Tekirdağ": { lat: 40.9781, lng: 27.511 },
    "Sakarya": { lat: 40.7569, lng: 30.3781 },
    "Balıkesir": { lat: 39.6484, lng: 27.8826 },
    "Manisa": { lat: 38.6191, lng: 27.4289 },
    "Aydın": { lat: 37.845, lng: 27.8396 },
    "Muğla": { lat: 37.2153, lng: 28.3636 },
    "Trabzon": { lat: 41.0015, lng: 39.7178 },
    "Ordu": { lat: 40.9862, lng: 37.8797 },
    "Giresun": { lat: 40.9128, lng: 38.3895 },
    "Rize": { lat: 41.0255, lng: 40.5177 },
    "Erzurum": { lat: 39.9043, lng: 41.2679 },
    "Diyarbakır": { lat: 37.9144, lng: 40.2306 },
    "Şanlıurfa": { lat: 37.1674, lng: 38.7955 },
    "Malatya": { lat: 38.3552, lng: 38.3095 },
    "Kahramanmaraş": { lat: 37.5753, lng: 36.9228 },
    "Hatay": { lat: 36.202, lng: 36.16 },
    "Çanakkale": { lat: 40.1553, lng: 26.4142 },
    "Edirne": { lat: 41.6764, lng: 26.5557 },
    "Kırklareli": { lat: 41.7356, lng: 27.2252 },
    "Yalova": { lat: 40.65, lng: 29.2667 },
    "Afyonkarahisar": { lat: 38.7578, lng: 30.5387 },
    "Isparta": { lat: 37.7648, lng: 30.5566 },
    "Burdur": { lat: 37.7183, lng: 30.2833 },
    "Uşak": { lat: 38.6823, lng: 29.4082 },
    "Kütahya": { lat: 39.4191, lng: 29.9857 },
    "Bilecik": { lat: 40.1451, lng: 29.979 },
    "Aksaray": { lat: 38.3687, lng: 34.037 },
    "Niğde": { lat: 37.9667, lng: 34.6833 },
    "Sivas": { lat: 39.7477, lng: 37.0179 },
    "Tokat": { lat: 40.3167, lng: 36.55 },
    "Çorum": { lat: 40.5506, lng: 34.9556 },
    "Kastamonu": { lat: 41.3766, lng: 33.7765 },
    "Zonguldak": { lat: 41.4564, lng: 31.7987 },
    "Karabük": { lat: 41.2061, lng: 32.6204 },
    "Düzce": { lat: 40.8438, lng: 31.1565 },
    "Van": { lat: 38.4891, lng: 43.4089 },
    "Batman": { lat: 37.8874, lng: 41.1322 },
    "Mardin": { lat: 37.3131, lng: 40.7436 },
    "Siirt": { lat: 37.9333, lng: 41.95 },
    "Elazığ": { lat: 38.6743, lng: 39.2232 },
    "Amasya": { lat: 40.6539, lng: 35.8331 },
    "Kırşehir": { lat: 39.1461, lng: 34.1595 },
    "Nevşehir": { lat: 38.6244, lng: 34.7239 },
    "Çankırı": { lat: 40.6013, lng: 33.6134 },
    "Yozgat": { lat: 39.82, lng: 34.8044 },
    "Gümüşhane": { lat: 40.46, lng: 39.48 },
  };

  const chosen = citiesAll.slice(0, Math.min(opts.countCities, citiesAll.length));

  const cityMult: Record<string, number> = {};
  for (const c of chosen) {
    let m = 1.0;
    if (c === "İstanbul") m = 2.35;
    else if (c === "Ankara" || c === "İzmir") m = 1.85;
    else if (["Kocaeli","Bursa","Antalya","Tekirdağ","Sakarya"].includes(c)) m = 1.55;
    else if (["Muğla","Aydın","Manisa","Balıkesir","Çanakkale","Edirne","Kırklareli","Yalova"].includes(c)) m = 1.35;
    else if (["Gaziantep","Adana","Mersin","Konya","Kayseri","Samsun","Eskişehir","Denizli","Trabzon"].includes(c)) m = 1.2;
    else if (["Diyarbakır","Şanlıurfa","Erzurum","Van","Mardin","Batman","Elazığ"].includes(c)) m = 1.05;
    cityMult[c] = m;
  }

  const demoAreas: Record<string, MarketArea> = {};
  for (const c of chosen) {
    const base = Math.round(12000 * (cityMult[c] ?? 1));
    demoAreas[c] = {
      id: `area_${slug(c)}`,
      city: c,
      district: null,
      name: `${c} Genel`,
      base_m2_price: base,
      expected_real_return_annual: 0.03 + rng() * 0.03,
      inflation_annual: 0.0,
      vol_annual: 0.10 + rng() * 0.08,
      cycle_strength: 0.45 + rng() * 0.4,
      shock_prob_annual: 0.05 + rng() * 0.05,
      shock_size: -0.06 - rng() * 0.08,
    };
  }

  const propsOut: Property[] = [];

  for (let i = 0; i < opts.countProps; i++) {
    const city = chosen[Math.floor(rng() * chosen.length)];
    const mult = cityMult[city] ?? 1.0;

    const zoning: "imarli" | "imarsiz" = rng() < 0.58 ? "imarli" : "imarsiz";

    const baseImarli = 12000 * mult;
    const baseImarsiz = 4500 * mult;

    const pricePerM2 = zoning === "imarli" ? jitter(rng, baseImarli, 0.22) : jitter(rng, baseImarsiz, 0.28);

    const areaM2 = zoning === "imarli" ? Math.round(300 + rng() * 2400) : Math.round(800 + rng() * 9200);

    const dev = clampInt(25 + rng() * 65 + (zoning === "imarli" ? 10 : -5), 0, 100);
    const risk = clampInt(15 + rng() * 75 + (zoning === "imarsiz" ? 10 : -6), 0, 100);

    const last30 = (rng() - 0.5) * 18 + (zoning === "imarli" ? 3 : 0);
    const expAnnual = 8 + rng() * 18 + (zoning === "imarli" ? 4 : 0);

    const ada = 10 + Math.floor(rng() * 200);
    const parsel = 1 + Math.floor(rng() * 500);

    const title = `${city} ${ada} Ada ${parsel} Parsel`;

    const district = demoDistrict(city, rng);
    const neighborhood = demoNeighborhood(rng);

    const base = CITY_COORDS[city] ?? { lat: 39 + (rng() - 0.5) * 6, lng: 35 + (rng() - 0.5) * 8 };
    const spread = zoning === "imarli" ? 0.10 : 0.22;
    const lat = base.lat + (rng() - 0.5) * spread;
    const lng = base.lng + (rng() - 0.5) * spread * 1.25;

    propsOut.push({
      id: `demo_${i}_${slug(city)}_${ada}_${parsel}`,
      title,
      city,
      district,
      neighborhood,
      zoning_status: zoning,
      price_per_m2: Math.round(pricePerM2),
      total_area_m2: areaM2,
      risk_score: risk,
      development_score: dev,
      expected_annual_return: Number(expAnnual.toFixed(2)),
      last_30d_change: Number(last30.toFixed(2)),
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      quality_score: clamp01(0.45 + dev / 220 - risk / 260 + (rng() - 0.5) * 0.08),
      rental_yield_annual: clamp01(0.035 + rng() * 0.03),
      total_shares: 100000,
      area: demoAreas[city],
    });
  }

  propsOut.sort((a, b) => b.development_score - a.development_score - (b.risk_score - a.risk_score));
  return propsOut;
}

function demoDistrict(city: string, rng: () => number) {
  const pool: Record<string, string[]> = {
    İstanbul: ["Çekmeköy", "Ümraniye", "Beylikdüzü", "Başakşehir", "Pendik", "Kartal", "Arnavutköy", "Silivri"],
    Ankara: ["Gölbaşı", "Çankaya", "Etimesgut", "Yenimahalle", "Sincan", "Keçiören"],
    İzmir: ["Bornova", "Karşıyaka", "Menemen", "Torbalı", "Urla", "Çeşme"],
    Antalya: ["Kepez", "Konyaaltı", "Muratpaşa", "Aksu", "Döşemealtı"],
  };
  const arr = pool[city] ?? ["Merkez", "Sanayi", "Yeni Mah.", "Organize", "Kuzey", "Güney"];
  return arr[Math.floor(rng() * arr.length)];
}

function demoNeighborhood(rng: () => number) {
  const arr = ["Atatürk", "Cumhuriyet", "Yeni", "Bahçelievler", "Yıldız", "Gazi", "Çınar", "Pınar", "Kurtuluş"];
  return `${arr[Math.floor(rng() * arr.length)]} Mah.`;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rng: () => number, base: number, pct: number) {
  const n = (rng() - 0.5) * 2;
  return base * (1 + n * pct);
}

function clampInt(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, Math.round(x)));
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}