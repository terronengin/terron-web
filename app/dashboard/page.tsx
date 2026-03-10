"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  country?: string | null;
  city: string;
  district: string | null;
  neighborhood?: string | null;
  zoning_status?: "imarli" | "imarsiz" | "bilinmiyor" | string | null;
  price_per_m2?: number | null;
  total_area_m2: number;
  available_m2?: number | null;
  sold_m2?: number | null;
  min_buy_m2?: number | null;
  max_buy_m2?: number | null;
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
type PriceBand = "" | "0-10000" | "10001-25000" | "25001-50000" | "50001-100000" | "100001+";
type ZoningBand = "" | "imarli" | "imarsiz" | "bilinmiyor";
type AreaBand = "" | "0-500" | "501-2000" | "2001-10000" | "10001+";
type InsightTab = "arsa" | "gelisim" | "risk";

const USE_DEMO_SEED_IF_EMPTY = true;
const DEMO_CITY_COUNT = 30;
const DEMO_PROPERTY_COUNT = 6000;
const DEMO_MIN_PER_DISTRICT = 15;
const DEMO_MAX_PER_DISTRICT = 20;

type CartItem = {
  key: string;
  property: Property;
  m2: number;
  pricePerM2: number;
  totalPaid: number;
};

type DemoPosition = {
  id: string;
  property_id: string;
  m2: number;
  total_paid: number;
  entry_price_m2: number;
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
  const [opening, setOpening] = useState(false);

  const [buyM2, setBuyM2] = useState<number>(10);
  const [buyBudget, setBuyBudget] = useState<number>(0);

  const [activeInsightTab, setActiveInsightTab] = useState<InsightTab>("arsa");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);

  const HEADER_H = 64;

  function isDemoPropertyId(id: string) {
    return typeof id === "string" && id.startsWith("demo_");
  }

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
    return cart.reduce((s, x) => s + Number(x.totalPaid || 0), 0);
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

  function getEffectivePricePerM2(p: Property | null) {
    if (!p) return 0;
    const sim = getRealEstateSim(p);
    return sim?.pricePerM2 || Number(p.price_per_m2 ?? 0) || Number(p.area?.base_m2_price ?? 0) || 1;
  }

  function updateLocalPropertyM2(propertyId: string, purchasedM2: number) {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== propertyId) return p;
        const available = getPropertyAvailableM2(p);
        const sold = getPropertySoldM2(p);
        return {
          ...p,
          available_m2: Math.max(0, available - purchasedM2),
          sold_m2: sold + purchasedM2,
        };
      })
    );

    setSelected((prev) => {
      if (!prev || prev.id !== propertyId) return prev;
      const available = getPropertyAvailableM2(prev);
      const sold = getPropertySoldM2(prev);
      return {
        ...prev,
        available_m2: Math.max(0, available - purchasedM2),
        sold_m2: sold + purchasedM2,
      };
    });
  }

  function syncBuyFromM2(nextM2: number, pricePerM2: number) {
    const safeM2 = Math.max(0, nextM2 || 0);
    setBuyM2(safeM2);
    setBuyBudget(Math.round(safeM2 * Math.max(1, pricePerM2)));
  }

  function syncBuyFromBudget(nextBudget: number, pricePerM2: number) {
    const safeBudget = Math.max(0, nextBudget || 0);
    setBuyBudget(safeBudget);
    const calcM2 = safeBudget / Math.max(1, pricePerM2);
    setBuyM2(Number(calcM2.toFixed(2)));
  }

  function addSelectedToCart() {
    if (!selected) {
      alert("Önce bir arsa seç.");
      return;
    }

    const m2 = Number(buyM2);
    if (!Number.isFinite(m2) || m2 <= 0) {
      alert("m² miktarı geçersiz.");
      return;
    }

    const minBuy = Math.max(1, Number(selected.min_buy_m2 ?? 1));
    const maxBuy = Number(selected.max_buy_m2 ?? getPropertyAvailableM2(selected));
    const available = getPropertyAvailableM2(selected);

    if (m2 < minBuy) {
      alert(`Minimum alım ${formatNumber(minBuy)} m²`);
      return;
    }

    if (m2 > available) {
      alert(`Bu arsada sadece ${formatNumber(available)} m² kaldı.`);
      return;
    }

    if (Number.isFinite(maxBuy) && m2 > maxBuy) {
      alert(`Bu arsa için tek seferde maksimum ${formatNumber(maxBuy)} m² alabilirsin.`);
      return;
    }

    const pricePerM2 = getEffectivePricePerM2(selected);
    const totalPaid = m2 * Math.max(1, pricePerM2);

    setCart((prev) => [
      {
        key: `${selected.id}_${Date.now()}`,
        property: selected,
        m2,
        pricePerM2,
        totalPaid,
      },
      ...prev,
    ]);

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

    if (USE_DEMO_SEED_IF_EMPTY && list.length < 100) {
      try {
        const seeded = await generateDemoPropertiesFromDistrictGeo({
          countCities: DEMO_CITY_COUNT,
          countProps: DEMO_PROPERTY_COUNT,
          minPerDistrict: DEMO_MIN_PER_DISTRICT,
          maxPerDistrict: DEMO_MAX_PER_DISTRICT,
          seed: 1337,
        });

        setItems(seeded);
        setSelected((prev) => prev ?? seeded[0] ?? null);
        return;
      } catch (e) {
        console.error("[DEMO] seed error:", e);
      }
    }

    setItems(list);
    setSelected((prev) => prev ?? list[0] ?? null);
  }

  useEffect(() => {
    if (!email) return;
    load();
  }, [email, city, district, neighborhood, riskBand, trendBand, priceBand, zoning, areaBand]);

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let arr = [...items];

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
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    return arr;
  }, [items, searchText]);

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

    const avgPricePerM2 = arr.reduce((s, x) => s + Number(getEffectivePricePerM2(x)), 0) / Math.max(1, count);
    const avgRisk = arr.reduce((s, x) => s + Number(x.risk_score ?? 0), 0) / Math.max(1, count);
    const avgDevelopment = arr.reduce((s, x) => s + Number(x.development_score ?? 0), 0) / Math.max(1, count);
    const avgReturn = arr.reduce((s, x) => s + Number(x.expected_annual_return ?? 0), 0) / Math.max(1, count);

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
  }, [visibleItems]);

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

  useEffect(() => {
    if (!email) return;
    ensureAndLoadWallet();
  }, [email]);

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

    const out = simulatePropertyPriceTRY(propertyForSim as any, 0, seedScope);
    const totalShares = Number(p.total_shares ?? 100000);
    const sharePrice = out.price / Math.max(1, totalShares);

    return { ...out, sharePrice, totalShares };
  }

  async function handleOpenPosition() {
    try {
      if (!selected) {
        alert("Önce bir arsa seç.");
        return;
      }

      const m2 = Number(buyM2);
      if (!Number.isFinite(m2) || m2 <= 0) {
        alert("m² miktarı geçersiz.");
        return;
      }

      const available = getPropertyAvailableM2(selected);
      const minBuy = Math.max(1, Number(selected.min_buy_m2 ?? 1));
      const maxBuy = Number(selected.max_buy_m2 ?? available);
      const entryPriceM2 = getEffectivePricePerM2(selected);
      const totalPaid = m2 * Math.max(1, entryPriceM2);

      if (m2 < minBuy) {
        alert(`Minimum alım ${formatNumber(minBuy)} m²`);
        return;
      }

      if (m2 > available) {
        alert(`Bu arsada sadece ${formatNumber(available)} m² kaldı.`);
        return;
      }

      if (Number.isFinite(maxBuy) && m2 > maxBuy) {
        alert(`Bu arsa için tek seferde maksimum ${formatNumber(maxBuy)} m² alabilirsin.`);
        return;
      }

      if (isDemoPropertyId(selected.id)) {
        const currentBalance = Number(walletBalance ?? 0);
        if (currentBalance < totalPaid) {
          alert(`Yetersiz bakiye. Bakiye: ${formatNumber(currentBalance)} Çip`);
          return;
        }

        setOpening(true);
        setWalletBalance(currentBalance - totalPaid);

        const list = loadDemoPositions();
        list.unshift({
          id: `demo_pos_${Date.now()}`,
          property_id: selected.id,
          m2,
          total_paid: totalPaid,
          entry_price_m2: entryPriceM2,
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

        updateLocalPropertyM2(selected.id, m2);

        alert("Demo m² yatırımı açıldı ✅");
        setOpening(false);
        return;
      }      setOpening(true);

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

      if (balance < totalPaid) {
        alert(`Yetersiz bakiye. Bakiye: ${formatNumber(balance)} Çip`);
        setWalletBalance(balance);
        setOpening(false);
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
        alert("Arsa stoku güncellenemedi: " + propErr.message);
        setOpening(false);
        return;
      }

      const newBalance = balance - totalPaid;

      const { error: upErr } = await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
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
        setOpening(false);
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

      const { error: posErr } = await supabase.from("positions").insert(payload);

      if (posErr) {
        await supabase
          .from("wallets")
          .update({ balance: balance, updated_at: new Date().toISOString() })
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
        setOpening(false);
        return;
      }

      setWalletBalance(newBalance);
      updateLocalPropertyM2(selected.id, m2);

      alert("m² pozisyonu açıldı ✅");
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
          list.unshift({
            id: `demo_pos_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
            property_id: it.property.id,
            m2: it.m2,
            total_paid: it.totalPaid,
            entry_price_m2: it.pricePerM2,
            created_at: new Date().toISOString(),
            snapshot: {
              title: it.property.title,
              city: it.property.city,
              district: it.property.district,
              neighborhood: it.property.neighborhood,
              latitude: it.property.latitude,
              longitude: it.property.longitude,
            },
          });

          updateLocalPropertyM2(it.property.id, it.m2);
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

        const realTotal = realItems.reduce((s, x) => s + Number(x.totalPaid || 0), 0);

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

        const touchedProps: Array<{ id: string; available: number; sold: number }> = [];

        for (const it of realItems) {
          const currentProp = items.find((x) => x.id === it.property.id) ?? it.property;
          const available = getPropertyAvailableM2(currentProp);
          const sold = getPropertySoldM2(currentProp);

          if (it.m2 > available) {
            alert(`${currentProp.title} için yeterli m² kalmadı.`);
            setCheckingOut(false);
            return;
          }

          touchedProps.push({
            id: currentProp.id,
            available,
            sold,
          });

          const { error: propErr } = await supabase
            .from("properties")
            .update({
              available_m2: Math.max(0, available - it.m2),
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
          .update({ balance: newBalanceDb, updated_at: new Date().toISOString() })
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
            entry_price_m2: it.pricePerM2,
            amount: it.totalPaid,
            entry_price: it.pricePerM2,
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
              .update({ balance: balanceDb, updated_at: new Date().toISOString() })
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

          if (ins?.id) insertedIds.push(String(ins.id));
          updateLocalPropertyM2(it.property.id, it.m2);
        }

        setWalletBalance(newBalanceDb);
      } else {
        setWalletBalance(Math.max(0, currentBalance - total));
      }

      clearCart();
      alert("Toplu m² alımı tamam ✅");
      setCheckingOut(false);
    } catch (e: any) {
      console.error("[CART] exception:", e);
      alert("Beklenmeyen hata: " + (e?.message ?? String(e)));
      setCheckingOut(false);
    }
  }

  const selectedSim = selected ? getRealEstateSim(selected) : null;
  const selectedPricePerM2 = selected ? getEffectivePricePerM2(selected) : 0;
  const selectedAvailableM2 = getPropertyAvailableM2(selected);
  const selectedSoldM2 = getPropertySoldM2(selected);
  const selectedMinBuyM2 = Math.max(1, Number(selected?.min_buy_m2 ?? 1));
  const selectedMaxBuyM2 = Number(selected?.max_buy_m2 ?? selectedAvailableM2);
  const selectedMinBuyCost = Math.max(1, selectedMinBuyM2) * Math.max(1, selectedPricePerM2);
  const selectedTotalCost = Math.max(0, Number(buyM2 || 0)) * Math.max(1, selectedPricePerM2);

  useEffect(() => {
    if (!selected) return;
    const safeMin = Math.max(1, Number(selected.min_buy_m2 ?? 1));
    const price = getEffectivePricePerM2(selected);
    setBuyM2(safeMin);
    setBuyBudget(Math.round(safeMin * price));
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
    return [clamp(base - 20, 0, 100), clamp(base - 14, 0, 100), clamp(base - 8, 0, 100), clamp(base - 3, 0, 100), clamp(base, 0, 100)];
  }, [selected]);

  const riskHistory = useMemo(() => {
    if (!selected) return [];
    const base = clamp(Number(selected.risk_score ?? 50), 0, 100);
    return [clamp(base + 8, 0, 100), clamp(base + 5, 0, 100), clamp(base + 3, 0, 100), clamp(base + 1, 0, 100), clamp(base, 0, 100)];
  }, [selected]);

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
          width: 380,
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
          <div style={labelStyle}>₺/m² Fiyat</div>
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
          <button onClick={() => setPanelOpen(false)} style={{ ...btnOutline, flex: 1 }}>
            Uygula
          </button>
        </div>

        <div style={{ marginTop: 18, fontSize: 12, opacity: 0.75 }}>Öne Çıkan Arsalar</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {regionList.map((p) => {
            const pPrice = getEffectivePricePerM2(p);
            const pAvailable = getPropertyAvailableM2(p);

            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p);
                  setPanelOpen(false);
                }}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 14,
                  background: selected?.id === p.id ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
                  border: selected?.id === p.id ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.08)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
                  Kalan {formatNumber(Math.round(pAvailable))} m² • Risk %{Math.round(p.risk_score)} • Gelişim %{Math.round(p.development_score)}
                </div>
              </button>
            );
          })}
        </div>
      </div>      <section style={{ position: "absolute", inset: 0 }}>
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
            onSetNeighborhood={(n) => {
              setNeighborhood(n);
            }}
            onSelectPropertyId={(id) => {
              const found = items.find((x) => x.id === id) || filteredItems.find((x) => x.id === id) || null;
              if (found) setSelected(found);
            }}
            onOpenInfo={() => undefined}
          />
        </div>

        {selected && (
          <div
            style={{
              position: "absolute",
              right: 16,
              top: HEADER_H + 12,
              width: 370,
              maxHeight: "calc(100vh - 88px)",
              borderRadius: 18,
              background: "rgba(10,14,24,0.70)",
              border: "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              zIndex: 12,
              overflow: "hidden",
              boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                height: 46,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.84, fontWeight: 900, letterSpacing: 0.5 }}>
                m² Yatırım Paneli
              </div>
              <button onClick={() => setSelected(null)} style={smallGhostBtn} title="Kapat">
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 12,
                overflowY: "auto",
                maxHeight: "calc(100vh - 134px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ lineHeight: 1.15, minWidth: 0 }}>
                  <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: 0.3 }}>
                    {selected.neighborhood ? selected.neighborhood : selected.district ? selected.district : selected.city}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    {selected.city}
                    {selected.district && ` / ${selected.district}`}
                    {selected.neighborhood && ` / ${selected.neighborhood}`}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    Toplam Alan: <b>{formatNumber(selected.total_area_m2)}</b> m²
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Arsa Değeri</div>
                  <div style={{ fontSize: 18, fontWeight: 1100, letterSpacing: 0.2 }}>
                    {selectedSim
                      ? `₺${formatTRY(selectedSim.price)}`
                      : `₺${formatTRY(selectedPricePerM2 * selected.total_area_m2)}`}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                    {selected.zoning_status ? String(selected.zoning_status).toUpperCase() : "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div style={metricBox}>
                  <div style={metricLabel}>Gelişim</div>
                  <div style={metricValue}>%{formatInt(selected.development_score)}</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>Risk</div>
                  <div style={metricValue}>%{formatInt(selected.risk_score)}</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>Son 30 Gün</div>
                  <div style={metricValue}>{signedPct(selected.last_30d_change)}%</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>Yıllık Beklenti</div>
                  <div style={metricValue}>%{Number(selected.expected_annual_return ?? 0).toFixed(1)}</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>₺/m² Fiyat</div>
                  <div style={metricValue}>₺{formatTRY(selectedPricePerM2)}</div>
                </div>

                <div style={metricBox}>
                  <div style={metricLabel}>Min. Alış Tutarı</div>
                  <div style={metricValue}>₺{formatTRY(selectedMinBuyCost)}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                <button onClick={() => setActiveInsightTab("arsa")} style={tabBtn(activeInsightTab === "arsa")}>
                  Arsa Bilgisi
                </button>
                <button onClick={() => setActiveInsightTab("gelisim")} style={tabBtn(activeInsightTab === "gelisim")}>
                  Gelişim
                </button>
                <button onClick={() => setActiveInsightTab("risk")} style={tabBtn(activeInsightTab === "risk")}>
                  Risk
                </button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                {activeInsightTab === "arsa" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                      <b>Ada / Parsel</b>: Demo aşamada otomatik üretim. Gerçek sistemde satıcı tarafından girilecek.
                      <br />
                      <b>Konum</b>: {selected.city}
                      {selected.district ? ` / ${selected.district}` : ""}
                      {selected.neighborhood ? ` / ${selected.neighborhood}` : ""}
                      <br />
                      <b>İmar Durumu</b>: {selected.zoning_status || "Bilinmiyor"}
                      <br />
                      <b>Toplam Alan</b>: {formatNumber(selected.total_area_m2)} m²
                      <br />
                      <b>Kalan Alan</b>: {formatNumber(Math.round(selectedAvailableM2))} m²
                      <br />
                      <b>Satılan Alan</b>: {formatNumber(Math.round(selectedSoldM2))} m²
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>Etrafında</div>
                        <div style={miniInfoText}>Yol, gelişim aksı, yerleşim genişleme alanı</div>
                      </div>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>Yatırım Notu</div>
                        <div style={miniInfoText}>Parçalı alıma uygun, m² bazlı erişilebilir</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeInsightTab === "gelisim" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.86, lineHeight: 1.5 }}>
                      Bu alanın gelişim puanı <b>%{formatInt(selected.development_score)}</b>. Son 5 yıllık ivme,
                      ulaşım etkisi, çevre yerleşim artışı ve değerleme baskısı ile birlikte okunur.
                    </div>

                    <MiniBars title="Son 5 Yıl Gelişim Skoru" values={developmentHistory} suffix="%" />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>Neden gelişiyor?</div>
                        <div style={miniInfoText}>Yakın yerleşim yoğunluğu, altyapı aksı, yatırım talebi</div>
                      </div>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>İmar açılımı etkisi</div>
                        <div style={miniInfoText}>Bölgesel dönüşüm ve genişleme potansiyeli</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeInsightTab === "risk" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.86, lineHeight: 1.5 }}>
                      Bu alanın risk puanı <b>%{formatInt(selected.risk_score)}</b>. Likidite, imar belirsizliği,
                      çevresel dalgalanma ve piyasa oynaklığı ile birlikte değerlendirilir.
                    </div>

                    <MiniBars title="Son 5 Yıl Risk Skoru" values={riskHistory} suffix="%" />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>Likidite</div>
                        <div style={miniInfoText}>Parçalı satış kolaylığı orta seviyede</div>
                      </div>
                      <div style={miniInfoCard}>
                        <div style={miniInfoLabel}>Belirsizlik</div>
                        <div style={miniInfoText}>İmar ve piyasa döngüsü etkisi izlenmeli</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>Satış Doluluk Oranı</div>
                  <div style={{ fontSize: 12, fontWeight: 1000 }}>{soldPct.toFixed(1)}%</div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 10,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, soldPct))}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, rgba(201,162,39,0.85), rgba(245,215,110,0.95))",
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.72 }}>
                  Kalan: {formatNumber(Math.round(selectedAvailableM2))} m² • Minimum alım:{" "}
                  {formatNumber(selectedMinBuyM2)} m²
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.75 }}>Alım Paneli</div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={tinyLabel}>m² gir</div>
                      <input
                        type="number"
                        value={buyM2}
                        min={0}
                        step={0.01}
                        onChange={(e) => syncBuyFromM2(Number(e.target.value), selectedPricePerM2)}
                        style={inputStyle}
                        placeholder="Kaç m²?"
                      />
                    </div>

                    <div>
                      <div style={tinyLabel}>TL gir</div>
                      <input
                        type="number"
                        value={buyBudget}
                        min={0}
                        step={1}
                        onChange={(e) => syncBuyFromBudget(Number(e.target.value), selectedPricePerM2)}
                        style={inputStyle}
                        placeholder="Kaç TL?"
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.78 }}>Toplam Tutar</div>
                        <div style={{ fontSize: 18, fontWeight: 1000, marginTop: 6 }}>
                          {formatNumber(Math.round(selectedTotalCost))} Çip
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, opacity: 0.78 }}>Alınacak m²</div>
                        <div style={{ fontSize: 18, fontWeight: 1000, marginTop: 6 }}>
                          {formatDecimal(buyM2)} m²
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 8 }}>
                      {formatDecimal(buyM2)} m² × ₺{formatTRY(selectedPricePerM2)} / m²
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
                      Tek sefer maksimum:{" "}
                      {formatNumber(Math.round(Math.min(selectedAvailableM2, selectedMaxBuyM2)))} m²
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button style={neutralActionBtn} onClick={addSelectedToCart}>
                      Sepete Ekle
                    </button>

                    <button
                      style={{
                        ...neutralActionBtn,
                        opacity: opening ? 0.7 : 1,
                        cursor: opening ? "not-allowed" : "pointer",
                      }}
                      disabled={opening}
                      onClick={handleOpenPosition}
                    >
                      {opening ? "Alınıyor..." : "Tekli Satın Al"}
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ lineHeight: 1.1 }}>
                    <div style={{ fontSize: 14, fontWeight: 1000 }}>Sepet</div>
                    <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
                      {cart.length} ürün • Genel Toplam:{" "}
                      <span style={{ color: "#F5D76E" }}>{formatNumber(Math.round(cartTotal()))} Çip</span>
                    </div>
                  </div>

                  <button onClick={clearCart} style={smallGhostBtn} title="Sepeti temizle">
                    Temizle
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 180,
                    overflow: "auto",
                  }}
                >
                  {cart.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Sepet boş. “Sepete Ekle” ile birden çok arsa biriktir.
                    </div>
                  ) : (
                    cart.slice(0, 30).map((it) => (
                      <div
                        key={it.key}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 10,
                          alignItems: "center",
                          padding: "10px 10px",
                          borderRadius: 14,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.10)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {it.property.city}
                            {it.property.district ? ` / ${it.property.district}` : ""}
                            {it.property.neighborhood ? ` / ${it.property.neighborhood}` : ""}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
                            {formatDecimal(it.m2)} m²
                          </div>
                        </div>

                        <div style={{ fontWeight: 1000, fontSize: 12, whiteSpace: "nowrap" }}>
                          {formatNumber(Math.round(it.totalPaid))} Çip
                        </div>

                        <button onClick={() => removeFromCart(it.key)} style={smallGhostBtn} title="Sepetten çıkar">
                          ✕
                        </button>
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
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.16)",
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
          </div>
        )}
      </section>
    </div>
  );
}

function MiniBars(props: { title: string; values: number[]; suffix?: string }) {
  const { title, values, suffix = "" } = props;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.88, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {values.map((v, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr 42px", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{2021 + i}</div>
            <div
              style={{
                height: 10,
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
                  background: "linear-gradient(90deg, rgba(201,162,39,0.75), rgba(245,215,110,0.95))",
                }}
              />
            </div>
            <div style={{ fontSize: 11, textAlign: "right", opacity: 0.85 }}>
              {formatInt(v)}
              {suffix}
            </div>
          </div>
        ))}
      </div>
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

async function generateDemoPropertiesFromDistrictGeo(opts: {
  countCities: number;
  countProps: number;
  minPerDistrict: number;
  maxPerDistrict: number;
  seed: number;
}): Promise<Property[]> {
  const rng = mulberry32(opts.seed);

  const res = await fetch("/geo/gadm41_TUR_2.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("İlçe geojson okunamadı: /geo/gadm41_TUR_2.json");
  }

  const gj = await res.json();
  const rawFeatures = Array.isArray(gj?.features) ? gj.features : [];

  const districtFeatures = rawFeatures
    .map((f: any) => {
      const city = String(f?.properties?.NAME_1 || "").trim();
      const district = String(f?.properties?.NAME_2 || "").trim();
      if (!city || !district || !f?.geometry) return null;

      const bbox = bboxFromGeometryLocal(f.geometry);
      const centroid = centroidFromGeometryLocal(f.geometry);
      if (!bbox || !centroid) return null;

      return {
        city,
        district,
        geometry: f.geometry,
        bbox,
        centroid,
      };
    })
    .filter(Boolean) as Array<{
      city: string;
      district: string;
      geometry: any;
      bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
      centroid: [number, number];
    }>;

  const cityOrder = [
    "İstanbul",
    "Ankara",
    "İzmir",
    "Bursa",
    "Antalya",
    "Adana",
    "Konya",
    "Kocaeli",
    "Gaziantep",
    "Mersin",
    "Kayseri",
    "Samsun",
    "Eskişehir",
    "Denizli",
    "Tekirdağ",
    "Sakarya",
    "Balıkesir",
    "Manisa",
    "Aydın",
    "Muğla",
    "Trabzon",
    "Ordu",
    "Giresun",
    "Rize",
    "Erzurum",
    "Diyarbakır",
    "Şanlıurfa",
    "Malatya",
    "Kahramanmaraş",
    "Hatay",
  ];

  const citySet = new Set(districtFeatures.map((x) => x.city));
  const chosenCities = cityOrder.filter((c) => citySet.has(c)).slice(0, opts.countCities);

  const cityMult: Record<string, number> = {};
  for (const c of chosenCities) {
    let m = 1.0;
    if (c === "İstanbul") m = 2.35;
    else if (c === "Ankara" || c === "İzmir") m = 1.85;
    else if (["Kocaeli", "Bursa", "Antalya", "Tekirdağ", "Sakarya"].includes(c)) m = 1.55;
    else if (["Muğla", "Aydın", "Manisa", "Balıkesir", "Çanakkale", "Edirne", "Kırklareli", "Yalova"].includes(c)) m = 1.35;
    else if (["Gaziantep", "Adana", "Mersin", "Konya", "Kayseri", "Samsun", "Eskişehir", "Denizli", "Trabzon"].includes(c)) m = 1.2;
    else if (["Diyarbakır", "Şanlıurfa", "Erzurum", "Van", "Mardin", "Batman", "Elazığ"].includes(c)) m = 1.05;
    cityMult[c] = m;
  }

  const demoAreas: Record<string, MarketArea> = {};
  for (const c of chosenCities) {
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

  const targetDistricts = districtFeatures.filter((x) => chosenCities.includes(x.city));
  const out: Property[] = [];
  let idx = 0;

  for (const dist of targetDistricts) {
    const mult = cityMult[dist.city] ?? 1;
    const propertyCount =
      opts.minPerDistrict + Math.floor(rng() * (opts.maxPerDistrict - opts.minPerDistrict + 1));

    const neighborhoodNames = buildNeighborhoodPool(dist.district, rng);

    for (let i = 0; i < propertyCount; i++) {
      if (out.length >= opts.countProps) break;

      const zoning: "imarli" | "imarsiz" = rng() < 0.62 ? "imarli" : "imarsiz";

      const baseImarli = 12000 * mult;
      const baseImarsiz = 4800 * mult;

      const pricePerM2 = zoning === "imarli" ? jitter(rng, baseImarli, 0.22) : jitter(rng, baseImarsiz, 0.28);
      const areaM2 = zoning === "imarli" ? Math.round(350 + rng() * 2800) : Math.round(900 + rng() * 9800);

      const dev = clampInt(28 + rng() * 62 + (zoning === "imarli" ? 10 : -6), 0, 100);
      const risk = clampInt(18 + rng() * 70 + (zoning === "imarsiz" ? 10 : -6), 0, 100);

      const last30 = (rng() - 0.5) * 16 + (zoning === "imarli" ? 2.5 : 0);
      const expAnnual = 8 + rng() * 18 + (zoning === "imarli" ? 4 : 0);

      const neighborhood = neighborhoodNames[Math.floor(rng() * neighborhoodNames.length)];
      const point = randomPointInGeometry(dist.geometry, dist.bbox, rng) ?? dist.centroid;

      const ada = 10 + Math.floor(rng() * 350);
      const parsel = 1 + Math.floor(rng() * 900);

      out.push({
        id: `demo_${idx}_${slug(dist.city)}_${slug(dist.district)}_${ada}_${parsel}`,
        title: `${dist.city} ${dist.district} ${ada} Ada ${parsel} Parsel`,
        country: "Türkiye",
        city: dist.city,
        district: dist.district,
        neighborhood,
        zoning_status: zoning,
        price_per_m2: Math.round(pricePerM2),
        total_area_m2: areaM2,
        available_m2: areaM2,
        sold_m2: 0,
        min_buy_m2: 1,
        max_buy_m2: Math.max(50, Math.round(areaM2 * 0.25)),
        risk_score: risk,
        development_score: dev,
        expected_annual_return: Number(expAnnual.toFixed(2)),
        last_30d_change: Number(last30.toFixed(2)),
        latitude: Number(point[1].toFixed(6)),
        longitude: Number(point[0].toFixed(6)),
        quality_score: clamp01(0.45 + dev / 220 - risk / 260 + (rng() - 0.5) * 0.08),
        rental_yield_annual: clamp01(0.035 + rng() * 0.03),
        total_shares: 100000,
        area: demoAreas[dist.city],
      });

      idx += 1;
    }

    if (out.length >= opts.countProps) break;
  }

  out.sort((a, b) => {
    const sa =
      Number(a.development_score ?? 0) * 1.25 +
      Number(a.expected_annual_return ?? 0) -
      Number(a.risk_score ?? 0) * 0.7;

    const sb =
      Number(b.development_score ?? 0) * 1.25 +
      Number(b.expected_annual_return ?? 0) -
      Number(b.risk_score ?? 0) * 0.7;

    return sb - sa;
  });

  return out;
}

function buildNeighborhoodPool(district: string, rng: () => number) {
  const fixed = [
    "Atatürk Mah.",
    "Cumhuriyet Mah.",
    "Bahçelievler Mah.",
    "Yıldız Mah.",
    "Kurtuluş Mah.",
    "Pınar Mah.",
    "Yeni Mah.",
    "Çınar Mah.",
  ];

  const districtStem = district.replace(/( Belediyesi| İlçesi| Merkez)/gi, "").trim();
  const extra = [
    `${districtStem} Merkez Mah.`,
    `${districtStem} Yeni Yerleşim Mah.`,
    `${districtStem} Kuzey Mah.`,
    `${districtStem} Güney Mah.`,
    `${districtStem} Vadi Mah.`,
    `${districtStem} Park Mah.`,
  ];

  const merged = [...fixed, ...extra];
  const shuffled = [...merged].sort(() => rng() - 0.5);
  return shuffled.slice(0, 6 + Math.floor(rng() * 4));
}

function coordsFromGeometryLocal(geom: any): number[][] {
  if (!geom) return [];
  const out: number[][] = [];

  const walk = (arr: any) => {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === "number" && typeof arr[1] === "number") {
      out.push([Number(arr[0]), Number(arr[1])]);
      return;
    }
    for (const x of arr) walk(x);
  };

  walk(geom.coordinates);
  return out;
}

function bboxFromGeometryLocal(geom: any) {
  const pts = coordsFromGeometryLocal(geom);
  if (!pts.length) return null;

  let minLng = pts[0][0];
  let minLat = pts[0][1];
  let maxLng = pts[0][0];
  let maxLat = pts[0][1];

  for (const [lng, lat] of pts) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, minLat, maxLng, maxLat };
}

function centroidFromGeometryLocal(geom: any): [number, number] | null {
  const pts = coordsFromGeometryLocal(geom);
  if (!pts.length) return null;

  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of pts) {
    sx += lng;
    sy += lat;
  }
  return [sx / pts.length, sy / pts.length];
}

function randomPointInGeometry(
  geom: any,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  rng: () => number
): [number, number] | null {
  for (let i = 0; i < 60; i++) {
    const lng = bbox.minLng + rng() * (bbox.maxLng - bbox.minLng);
    const lat = bbox.minLat + rng() * (bbox.maxLat - bbox.minLat);
    if (pointInGeometry([lng, lat], geom)) return [lng, lat];
  }
  return null;
}

function pointInGeometry(point: [number, number], geom: any) {
  if (!geom) return false;
  if (geom.type === "Polygon") return pointInPolygon(point, geom.coordinates);
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly: any) => pointInPolygon(point, poly));
  }
  return false;
}

function pointInPolygon(point: [number, number], polygonCoords: any[]) {
  if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) return false;

  const outerRing = polygonCoords[0];
  let inside = rayCast(point, outerRing);
  if (!inside) return false;

  for (let i = 1; i < polygonCoords.length; i++) {
    if (rayCast(point, polygonCoords[i])) return false;
  }
  return true;
}

function rayCast(point: [number, number], ring: any[]) {
  let inside = false;
  const x = point[0];
  const y = point[1];

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
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