"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const BUY_FEE_RATE = 0.005;
const SELL_FEE_RATE = 0.01;

type PositionProperty = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  expected_annual_return: number | null;
  risk_score: number | null;
  development_score: number | null;
  last_30d_change: number | null;
  total_area_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
  price_per_m2: number | null;
};

type PositionRow = {
  id: string;
  user_id: string;
  property_id: string;
  m2: number | null;
  total_paid: number | null;
  entry_price_m2: number | null;
  amount: number | null;
  units: number | null;
  entry_price: number | null;
  created_at: string;
  property?: PositionProperty | null;
  is_demo?: boolean;
};

type DemoPosition = {
  id: string;
  property_id: string;
  m2: number;
  total_paid: number;
  entry_price_m2: number;
  created_at: string;
  snapshot?: {
    title?: string;
    city?: string;
    district?: string | null;
    neighborhood?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
};

type EnrichedPositionRow = PositionRow & {
  _m2: number;
  _entryPriceM2: number;
  _grossEntryTotal: number;
  _totalPaid: number;
  _entryFeeIncluded: boolean;
  _holdingHours: number;
  _currentPriceM2: number;
  _grossCurrentValue: number;
  _sellFeeAmount: number;
  _netCurrentValue: number;
  _pnl: number;
  _pnlPct: number;
};

export default function PortfolioPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      setLoadingSession(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const user = session?.user ?? null;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  function hash01(str: string) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = h >>> 0;
    return u / 4294967296;
  }

  function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
  }

  function hoursSince(dateStr: string) {
    const created = new Date(dateStr).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - created);
    return diffMs / 3600000;
  }

  function getRegionBias(property: PositionProperty | null | undefined, propertyId: string) {
    const city = (property?.city ?? "").toLocaleLowerCase("tr-TR");
    const district = (property?.district ?? "").toLocaleLowerCase("tr-TR");
    const seed = hash01(`${propertyId}:${city}:${district}:region-bias`);

    let cityBias = 0;
    if (city.includes("istanbul")) cityBias = 0.018;
    else if (city.includes("ankara")) cityBias = 0.01;
    else if (city.includes("izmir")) cityBias = 0.012;
    else if (city.includes("antalya")) cityBias = 0.013;
    else if (city.includes("bursa")) cityBias = 0.008;
    else if (city.includes("kocaeli")) cityBias = 0.009;
    else if (city.includes("muğla") || city.includes("mugla")) cityBias = 0.011;
    else cityBias = (seed - 0.5) * 0.018;

    return clamp(cityBias, -0.025, 0.025);
  }

  function simulateCurrentPricePerM2(
    row: PositionRow,
    entryPriceM2: number
  ) {
    const property = row.property ?? null;
    const createdAt = row.created_at;
    const holdHours = hoursSince(createdAt);
    const holdDays = holdHours / 24;

    const annualReturn = Number(property?.expected_annual_return ?? 14);
    const riskScore = clamp(Number(property?.risk_score ?? 50), 0, 100);
    const devScore = clamp(Number(property?.development_score ?? 50), 0, 100);
    const last30dChange = clamp(Number(property?.last_30d_change ?? 0), -25, 25);

    const regionBias = getRegionBias(property, row.property_id);
    const demandSeed = hash01(`${row.property_id}:demand`);
    const cycleSeed = hash01(`${row.property_id}:cycle`);
    const noiseSeed = hash01(`${row.property_id}:${Math.floor(holdHours / 6)}:noise`);

    const annualDriftBase = annualReturn / 100;
    const developmentBoost = ((devScore - 50) / 50) * 0.035;
    const riskPenalty = ((riskScore - 50) / 50) * 0.03;
    const recentMomentum = (last30dChange / 100) * 0.18;
    const demandEffect = (demandSeed - 0.5) * 0.03;

    const netAnnualTrend =
      annualDriftBase +
      developmentBoost +
      recentMomentum +
      demandEffect +
      regionBias -
      riskPenalty;

    const dailyDrift = netAnnualTrend / 365;

    const earlyHoursSoftener = clamp(holdHours / 72, 0, 1);
    const firstDayLock = holdHours < 1 ? 0 : 1;

    const cycleWave =
      Math.sin((holdDays / 18) * Math.PI * 2 + cycleSeed * Math.PI * 2) * 0.0025;

    const microNoise =
      ((noiseSeed - 0.5) * 0.0045) *
      clamp(holdHours / 12, 0, 1);

    const cumulativeDrift = dailyDrift * holdDays;
    const rawMultiplier =
      1 +
      firstDayLock *
        (cumulativeDrift * earlyHoursSoftener + cycleWave + microNoise);

    const floorBand = holdHours < 24 ? 0.9925 : holdHours < 72 ? 0.985 : 0.94;
    const ceilBand = holdHours < 24 ? 1.0075 : holdHours < 72 ? 1.02 : 1.35;

    const multiplier = clamp(rawMultiplier, floorBand, ceilBand);

    return {
      holdHours,
      currentPriceM2: Math.max(1, entryPriceM2 * multiplier),
    };
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

  async function ensureAndLoadWallet(currentUserId: string) {
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .select("user_id,balance")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (wErr) {
      console.error("[wallet] load error:", wErr);
      return;
    }

    if (w?.balance != null) {
      setWalletBalance(Number(w.balance));
      return;
    }

    const { data: ins, error: insErr } = await supabase
      .from("wallets")
      .insert({ user_id: currentUserId, balance: 1000000 })
      .select("balance")
      .single();

    if (insErr) {
      console.error("[wallet] insert error:", insErr);
      return;
    }

    setWalletBalance(Number(ins.balance));
  }

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      await ensureAndLoadWallet(userId);

      const { data, error } = await supabase
        .from("positions")
        .select(
          `
          id,
          user_id,
          property_id,
          m2,
          total_paid,
          entry_price_m2,
          amount,
          units,
          entry_price,
          created_at,
          property:properties (
            id,
            title,
            city,
            district,
            neighborhood,
            expected_annual_return,
            risk_score,
            development_score,
            last_30d_change,
            total_area_m2,
            available_m2,
            sold_m2,
            price_per_m2
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[portfolio] load error:", error);
        setErrorMsg(error.message);
      }

      const normalizedDbRows: PositionRow[] = ((data ?? []) as any[]).map((row) => ({
        ...row,
        property: Array.isArray(row.property) ? row.property[0] ?? null : row.property ?? null,
        is_demo: false,
      }));

      const demoRows: PositionRow[] = loadDemoPositions().map((d) => ({
        id: d.id,
        user_id: userId,
        property_id: d.property_id,
        m2: Number(d.m2 ?? 0),
        total_paid: Number(d.total_paid ?? 0),
        entry_price_m2: Number(d.entry_price_m2 ?? 0),
        amount: Number(d.total_paid ?? 0),
        units: Number(d.m2 ?? 0),
        entry_price: Number(d.entry_price_m2 ?? 0),
        created_at: d.created_at,
        is_demo: true,
        property: {
          id: d.property_id,
          title: d.snapshot?.title || "Demo Arsa",
          city: d.snapshot?.city || "—",
          district: d.snapshot?.district ?? null,
          neighborhood: d.snapshot?.neighborhood ?? null,
          expected_annual_return: 14,
          risk_score: 48,
          development_score: 58,
          last_30d_change: 0.8,
          total_area_m2: null,
          available_m2: null,
          sold_m2: null,
          price_per_m2: Number(d.entry_price_m2 ?? 0),
        },
      }));

      const merged = [...demoRows, ...normalizedDbRows]
        .filter((row) => {
          const rawEntry =
            Number(row.entry_price_m2 ?? 0) ||
            Number(row.entry_price ?? 0) ||
            Number(row.property?.price_per_m2 ?? 0) ||
            0;

          const rawM2 =
            row.m2 != null
              ? Number(row.m2)
              : row.units != null
              ? Number(row.units)
              : rawEntry > 0
              ? Number(row.amount ?? 0) / rawEntry
              : 0;

          return Number.isFinite(rawM2) && rawM2 > 0.000001;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRows(merged);
      setLoading(false);
    };

    load();
  }, [userId]);  const enriched = useMemo<EnrichedPositionRow[]>(() => {
    return rows
      .map((r) => {
        const entryM2 =
          Number(r.entry_price_m2 ?? 0) ||
          Number(r.entry_price ?? 0) ||
          Number(r.property?.price_per_m2 ?? 0) ||
          1;

        const m2 =
          r.m2 != null
            ? Number(r.m2)
            : r.units != null
            ? Number(r.units)
            : Number(r.amount ?? 0) / Math.max(1, entryM2);

        if (!Number.isFinite(m2) || m2 <= 0) return null;

        const grossEntryTotal = m2 * entryM2;

        const rawStoredTotal =
          r.total_paid != null
            ? Number(r.total_paid)
            : r.amount != null
            ? Number(r.amount)
            : grossEntryTotal;

        const entryFeeIncluded = rawStoredTotal > grossEntryTotal * 1.001;

        const totalPaid = entryFeeIncluded
          ? rawStoredTotal
          : grossEntryTotal * (1 + BUY_FEE_RATE);

        const sim = simulateCurrentPricePerM2(r, entryM2);
        const grossCurrentValue = m2 * sim.currentPriceM2;
        const sellFeeAmount = grossCurrentValue * SELL_FEE_RATE;
        const netCurrentValue = Math.max(0, grossCurrentValue - sellFeeAmount);

        const pnl = netCurrentValue - totalPaid;
        const pnlPct = totalPaid > 0 ? (pnl / totalPaid) * 100 : 0;

        return {
          ...r,
          _m2: m2,
          _entryPriceM2: entryM2,
          _grossEntryTotal: grossEntryTotal,
          _totalPaid: totalPaid,
          _entryFeeIncluded: entryFeeIncluded,
          _holdingHours: sim.holdHours,
          _currentPriceM2: sim.currentPriceM2,
          _grossCurrentValue: grossCurrentValue,
          _sellFeeAmount: sellFeeAmount,
          _netCurrentValue: netCurrentValue,
          _pnl: pnl,
          _pnlPct: pnlPct,
        };
      })
      .filter((x): x is EnrichedPositionRow => Boolean(x));
  }, [rows]);

  const summary = useMemo(() => {
    const count = enriched.length;
    const totalM2 = enriched.reduce((acc, r) => acc + (Number(r._m2) || 0), 0);
    const totalInvested = enriched.reduce((acc, r) => acc + (Number(r._totalPaid) || 0), 0);
    const totalValue = enriched.reduce((acc, r) => acc + (Number(r._netCurrentValue) || 0), 0);
    const pnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    return { count, totalM2, totalInvested, totalValue, pnl, pnlPct };
  }, [enriched]);

  async function handleSell(row: EnrichedPositionRow) {
    if (sellingId) return;
    if (!userId) {
      alert("Kullanıcı bulunamadı.");
      return;
    }

    const grossSellValue = Math.round(Number(row._grossCurrentValue || 0));
    const feeAmount = Math.round(Number(row._sellFeeAmount || 0));
    const netSellValue = Math.round(Number(row._netCurrentValue || 0));

    if (!Number.isFinite(netSellValue) || netSellValue <= 0) {
      alert("Satış tutarı hesaplanamadı.");
      return;
    }

    const m2 = Number(row._m2 || 0);
    if (!Number.isFinite(m2) || m2 <= 0) {
      alert("m² bilgisi hatalı.");
      return;
    }

    const ok = window.confirm(
      `${row.property?.title ?? "Bu pozisyon"} satılsın mı?\n\n` +
        `Satılacak: ${formatNumber(m2)} m²\n` +
        `Brüt Tutar: ${formatNumber(grossSellValue)} Çip\n` +
        `Satış Komisyonu (%1): ${formatNumber(feeAmount)} Çip\n` +
        `Net Ödenecek: ${formatNumber(netSellValue)} Çip`
    );
    if (!ok) return;

    setSellingId(row.id);

    const prevRows = rows;
    const prevWallet = walletBalance;

    setRows((prev) => prev.filter((x) => x.id !== row.id));
    setWalletBalance((prev) => Math.round(Number(prev ?? 0) + netSellValue));

    try {
      if (row.is_demo) {
        const demoList = loadDemoPositions();
        const nextDemoList = demoList.filter((x) => x.id !== row.id);
        saveDemoPositions(nextDemoList);

        const { data: walletRow, error: walletErr } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();

        if (walletErr) throw walletErr;

        const dbBalance = Math.round(Number(walletRow?.balance ?? 0));
        const nextBalance = dbBalance + netSellValue;

        const { error: walletUpdateErr } = await supabase
          .from("wallets")
          .update({ balance: nextBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (walletUpdateErr) throw walletUpdateErr;

        setWalletBalance(nextBalance);
        alert("Demo pozisyon satıldı ✅");
        return;
      }

      const { data: walletRow, error: walletErr } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletErr) throw walletErr;

      const dbBalance = Math.round(Number(walletRow?.balance ?? 0));
      const nextBalance = Math.round(dbBalance + netSellValue);

      const { error: walletUpdateErr } = await supabase
        .from("wallets")
        .update({ balance: nextBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (walletUpdateErr) throw walletUpdateErr;

      const { data: propRow, error: propErr } = await supabase
        .from("properties")
        .select("available_m2,sold_m2,total_area_m2")
        .eq("id", row.property_id)
        .maybeSingle();

      if (propErr) throw propErr;

      const totalArea = Number(propRow?.total_area_m2 ?? 0);
      const curAvailable = propRow?.available_m2 != null ? Number(propRow.available_m2) : null;
      const curSold = propRow?.sold_m2 != null ? Number(propRow.sold_m2) : null;

      const derivedAvailable =
        curAvailable != null
          ? curAvailable
          : Math.max(0, totalArea - Math.max(0, Number(curSold ?? 0)));

      const nextAvailable = derivedAvailable + m2;
      const nextSold = Math.max(
        0,
        Number(curSold ?? Math.max(0, totalArea - derivedAvailable)) - m2
      );

      const { error: propUpdateErr } = await supabase
        .from("properties")
        .update({
          available_m2: nextAvailable,
          sold_m2: nextSold,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.property_id);

      if (propUpdateErr) {
        await supabase.from("wallets").update({ balance: dbBalance }).eq("user_id", userId);
        throw propUpdateErr;
      }

      const { error: revenueErr } = await supabase.from("platform_revenue").insert({
        user_id: userId,
        property_id: row.property_id,
        type: "sell_fee",
        gross_amount: grossSellValue,
        fee_rate: SELL_FEE_RATE,
        fee_amount: feeAmount,
        created_at: new Date().toISOString(),
      });

      if (revenueErr) {
        await supabase.from("wallets").update({ balance: dbBalance }).eq("user_id", userId);

        await supabase
          .from("properties")
          .update({
            available_m2: derivedAvailable,
            sold_m2: curSold ?? Math.max(0, totalArea - derivedAvailable),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.property_id);

        throw revenueErr;
      }

      const { error: deleteErr } = await supabase
        .from("positions")
        .delete()
        .eq("id", row.id)
        .eq("user_id", userId);

      if (deleteErr) {
        await supabase.from("wallets").update({ balance: dbBalance }).eq("user_id", userId);

        await supabase
          .from("properties")
          .update({
            available_m2: derivedAvailable,
            sold_m2: curSold ?? Math.max(0, totalArea - derivedAvailable),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.property_id);

        await supabase
          .from("platform_revenue")
          .delete()
          .eq("user_id", userId)
          .eq("property_id", row.property_id)
          .eq("type", "sell_fee")
          .eq("gross_amount", grossSellValue)
          .eq("fee_amount", feeAmount);

        throw deleteErr;
      }

      alert("Pozisyon satıldı ✅");
    } catch (err: any) {
      console.error("[SELL] error:", err);
      setRows(prevRows);
      setWalletBalance(prevWallet);
      alert("Satış sırasında hata oluştu: " + (err?.message ?? String(err)));
    } finally {
      setSellingId(null);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loadingSession) return <div style={{ padding: 24 }}>Yükleniyor...</div>;

  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Terron • Portföy</h1>
        <p>Giriş yapılmamış.</p>
        <button onClick={() => router.replace("/login")}>Giriş sayfasına git</button>
      </div>
    );
  }  return (
    <div style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <div style={topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={btnGhost}>
            ← Dashboard
          </button>
          <div style={{ fontWeight: 900, letterSpacing: 0.4 }}>Portföy (m²)</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={topbarStatsWrap}>
          <div style={pill}>Pozisyon: {summary.count}</div>
          <div style={pill}>Toplam m²: {formatNumber(summary.totalM2)}</div>
          <div style={pill}>
            Bakiye: {walletBalance == null ? "—" : `${formatNumber(walletBalance)} Çip`}
          </div>
          <div style={pill}>Net Değer: {formatNumber(Math.round(summary.totalValue))} Çip</div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
          {email}
        </div>

        <button onClick={logout} style={btnDanger}>
          Çıkış
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 1440, margin: "0 auto" }}>
        <div style={summaryGrid}>
          <div style={card}>
            <div style={label}>Toplam Yatırım</div>
            <div style={value}>{formatNumber(Math.round(summary.totalInvested))} Çip</div>
            <div style={subText}>Alış komisyonu dahil maliyet</div>
          </div>

          <div style={card}>
            <div style={label}>Net Güncel Değer</div>
            <div style={value}>{formatNumber(Math.round(summary.totalValue))} Çip</div>
            <div style={subText}>Satış komisyonu düşülmüş değer</div>
          </div>

          <div style={card}>
            <div style={label}>Kâr / Zarar</div>
            <div style={{ ...value, color: summary.pnl >= 0 ? "#86efac" : "#fca5a5" }}>
              {formatSigned(summary.pnl)} Çip
            </div>
            <div style={subText}>Net gerçekleşebilir fark</div>
          </div>

          <div style={card}>
            <div style={label}>% PnL</div>
            <div style={{ ...value, color: summary.pnlPct >= 0 ? "#86efac" : "#fca5a5" }}>
              {summary.pnlPct.toFixed(2)}%
            </div>
            <div style={subText}>Komisyonlar dahil</div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {errorMsg && (
          <div
            style={{
              ...card,
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.10)",
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800 }}>Hata</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{errorMsg}</div>
          </div>
        )}

        {loading ? (
          <div style={{ ...card, marginTop: 12, padding: 14 }}>Yükleniyor…</div>
        ) : (
          <div style={{ ...card, marginTop: 12, overflow: "hidden" }}>
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                fontWeight: 900,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>Pozisyonlarım</div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>
                İlk alımda kâr sıfıra yakın başlar; zamanla bölgesel trend, risk ve gelişim etkisi devreye girer.
              </div>
            </div>

            {enriched.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.8 }}>Henüz pozisyon yok.</div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: 1280, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tarih</th>
                      <th style={th}>Arsa</th>
                      <th style={th}>Bölge</th>
                      <th style={th}>m²</th>
                      <th style={th}>Entry ₺/m²</th>
                      <th style={th}>Bugün ₺/m²</th>
                      <th style={th}>Yatırım</th>
                      <th style={th}>Brüt Değer</th>
                      <th style={th}>Satış Kom.</th>
                      <th style={th}>Net Değer</th>
                      <th style={th}>K/Z</th>
                      <th style={th}>%PnL</th>
                      <th style={th}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={td}>{new Date(r.created_at).toLocaleString("tr-TR")}</td>
                        <td style={td}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <div style={{ fontWeight: 800 }}>
                              {r.property?.title ?? r.property_id.slice(0, 8)}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.65 }}>
                              {r.is_demo ? "Demo Pozisyon" : "Gerçek Pozisyon"}
                            </div>
                          </div>
                        </td>
                        <td style={td}>
                          {r.property?.city ?? "-"}
                          {r.property?.district ? ` / ${r.property.district}` : ""}
                          {r.property?.neighborhood ? ` / ${r.property.neighborhood}` : ""}
                        </td>
                        <td style={td}>{formatDecimal(r._m2)} m²</td>
                        <td style={td}>₺{formatDecimal(r._entryPriceM2)}</td>
                        <td style={td}>₺{formatDecimal(r._currentPriceM2)}</td>
                        <td style={td}>{formatNumber(Math.round(r._totalPaid))} Çip</td>
                        <td style={td}>{formatNumber(Math.round(r._grossCurrentValue))} Çip</td>
                        <td style={td}>-{formatNumber(Math.round(r._sellFeeAmount))} Çip</td>
                        <td style={td}>{formatNumber(Math.round(r._netCurrentValue))} Çip</td>
                        <td style={{ ...td, color: r._pnl >= 0 ? "#86efac" : "#fca5a5" }}>
                          {formatSigned(r._pnl)} Çip
                        </td>
                        <td style={{ ...td, color: r._pnlPct >= 0 ? "#86efac" : "#fca5a5" }}>
                          {Number(r._pnlPct).toFixed(2)}%
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => handleSell(r)}
                            disabled={sellingId === r.id}
                            style={{
                              ...sellBtn,
                              opacity: sellingId === r.id ? 0.7 : 1,
                              cursor: sellingId === r.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {sellingId === r.id ? "Satılıyor..." : r.is_demo ? "Demo Sat" : "Sat"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                padding: 12,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                fontSize: 12,
                opacity: 0.72,
                lineHeight: 1.6,
              }}
            >
              * Net değer hesaplamasında satış komisyonu (%1) düşülür. <br />
              * İlk alım anında ani kâr görünmesini engellemek için erken dönem hareketler bastırılmıştır. <br />
              * Bazı bölgeler zamanla artabilir, bazıları düşebilir, bazıları yatay kalabilir.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(x);
  } catch {
    return String(Math.round(x));
  }
}

function formatDecimal(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(x);
  } catch {
    return String(x.toFixed(2));
  }
}

function formatSigned(n: number) {
  const x = Number(n);
  const rounded = Number.isFinite(x) ? x : 0;
  const s = rounded >= 0 ? "+" : "";
  return s + formatNumber(rounded);
}

const topbar: React.CSSProperties = {
  minHeight: 64,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.2)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  backdropFilter: "blur(10px)",
  flexWrap: "wrap",
};

const topbarStatsWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};

const label: React.CSSProperties = {
  padding: "14px 14px 0 14px",
  fontSize: 12,
  opacity: 0.75,
};

const value: React.CSSProperties = {
  padding: "6px 14px 4px 14px",
  fontSize: 20,
  fontWeight: 950,
};

const subText: React.CSSProperties = {
  padding: "0 14px 14px 14px",
  fontSize: 11,
  opacity: 0.62,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  opacity: 0.95,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const pill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "white",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "white",
  cursor: "pointer",
};

const sellBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.30)",
  color: "white",
  fontWeight: 900,
  minWidth: 120,
  width: "100%",
  maxWidth: 140,
};