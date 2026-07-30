"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatM2 } from "@/lib/formatM2";
import { calculateSellQuoteTRY, grossAssetFromTotalPaid } from "@/lib/sim/realEstatePrice";
import { getTerronSalePricePerM2, type TerronPropertyPricingInput } from "@/lib/propertySalePrice";
import { AppShell } from "../components/AppShell";

type RealPositionRow = {
  id: string;
  property_id: string;
  m2: number | null;
  total_paid: number | null;
  created_at: string;
};

type PropertyLite = {
  id: string;
  title: string | null;
  city: string | null;
  price_per_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
};

type UnifiedRow = {
  key: string;
  positionId: string;
  propertyId: string;
  created_at: string;
  title: string;
  city: string;
  m2: number | null;
  entryGross: number | null;
  totalPaid: number | null;
  currentGross: number | null;
  sellNetTry: number | null;
  sellFeeTry: number | null;
  flowLabel: string;
  brutKz: number | null;
  netVsPaid: number | null;
};

type SoldRow = {
  id: string;
  property_title: string | null;
  city: string | null;
  m2: number;
  total_paid: number;
  sell_net: number;
  profit_try: number;
  profit_pct: number;
  sold_at: string;
};

type TabKey = "aktif" | "satilan";

function formatTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const card: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 14px 40px rgba(0,0,0,0.3)",
  padding: 16,
};

function PnlText({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value == null) return <span style={{ opacity: 0.5 }}>—</span>;
  const positive = value >= 0;
  return (
    <span style={{ color: positive ? "#86efac" : "#fca5a5", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
      {positive ? "+" : ""}
      {formatTRY(value)}
      {suffix}
    </span>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 8 }}>{title}</div>
      <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.75, lineHeight: 1.55 }}>{subtitle}</p>
      <Link
        href="/dashboard"
        style={{
          display: "inline-block",
          padding: "12px 22px",
          borderRadius: 14,
          fontWeight: 900,
          textDecoration: "none",
          color: "#0a0f1a",
          background: "linear-gradient(135deg, #e8d48a, #c9a227)",
          border: "1px solid rgba(245,215,110,0.5)",
        }}
      >
        Haritaya Git
      </Link>
    </div>
  );
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [realRows, setRealRows] = useState<RealPositionRow[]>([]);
  const [propById, setPropById] = useState<Record<string, PropertyLite>>({});
  const [soldRows, setSoldRows] = useState<SoldRow[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [sellingKey, setSellingKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("aktif");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      const em = user?.email ?? null;
      if (!user?.id) {
        if (!cancelled) {
          setEmail(null);
          setUserId(null);
          setRealRows([]);
          setPropById({});
          setSoldRows([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setEmail(em);
        setUserId(user.id);
      }

      const { data: posData, error: posErr } = await supabase
        .from("positions")
        .select("id,property_id,m2,total_paid,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (posErr) {
        console.warn("[portfolio] positions:", posErr.message);
        setRealRows([]);
        setPropById({});
      } else {
        const positions = (posData ?? []) as RealPositionRow[];
        setRealRows(positions);

        const ids = [...new Set(positions.map((p) => p.property_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: propData, error: propErr } = await supabase
            .from("properties")
            .select(
              "id,title,city,price_per_m2,total_area_m2,available_m2,sold_m2,development_score,last_30d_change,quality_score,risk_score,rental_yield_annual,min_buy_m2,total_shares"
            )
            .in("id", ids);
          if (!cancelled) {
            if (propErr) {
              console.warn("[portfolio] properties:", propErr.message);
              setPropById({});
            } else {
              const map: Record<string, PropertyLite> = {};
              for (const p of (propData ?? []) as PropertyLite[]) map[p.id] = p;
              setPropById(map);
            }
          }
        } else {
          setPropById({});
        }
      }

      const { data: soldData, error: soldErr } = await supabase
        .from("sold_positions")
        .select("id,property_title,city,m2,total_paid,sell_net,profit_try,profit_pct,sold_at")
        .eq("user_id", user.id)
        .order("sold_at", { ascending: false });
      if (!cancelled) {
        if (soldErr) {
          // Tablo henüz migrate edilmemiş olabilir — sessizce boş liste (empty-state) göster.
          console.warn("[portfolio] sold_positions:", soldErr.message);
          setSoldRows([]);
        } else {
          setSoldRows((soldData ?? []) as SoldRow[]);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const unified = useMemo(() => {
    const scope = userId ?? "global";
    return realRows.map((r) => {
      const prop = propById[r.property_id];
      const title = prop?.title?.trim() || `İlan ${r.property_id.slice(0, 8)}…`;
      const city = prop?.city?.trim() || "—";
      const m2 = Number(r.m2 ?? 0);
      const paid = Number(r.total_paid ?? 0);
      const entryGross = paid > 0 ? Math.round(grossAssetFromTotalPaid(paid)) : null;
      const salePx = prop ? getTerronSalePricePerM2(prop as TerronPropertyPricingInput, scope) : 0;
      let brutKz: number | null = null;
      let sellNetTry: number | null = null;
      let sellFeeTry: number | null = null;
      let currentGross: number | null = null;
      let netVsPaid: number | null = null;
      if (prop && salePx > 0 && m2 > 0) {
        const q = calculateSellQuoteTRY(salePx, m2);
        sellNetTry = Math.round(q.netProceeds);
        sellFeeTry = Math.round(q.sellFee);
        currentGross = Math.round(q.grossSaleValue);
        if (paid > 0) netVsPaid = Math.round(q.netProceeds - paid);
        if (entryGross != null && entryGross > 0) brutKz = Math.round(q.grossSaleValue - entryGross);
      }
      return {
        key: `real_${r.id}`,
        positionId: r.id,
        propertyId: r.property_id,
        created_at: r.created_at,
        title,
        city,
        m2: r.m2,
        entryGross,
        totalPaid: r.total_paid,
        currentGross,
        sellNetTry,
        sellFeeTry,
        flowLabel: "Pozisyon",
        brutKz,
        netVsPaid,
      } satisfies UnifiedRow;
    });
  }, [realRows, propById, userId]);

  const totals = useMemo(() => {
    let invested = 0;
    let currentValue = 0;
    for (const r of unified) {
      invested += Number(r.totalPaid ?? 0);
      currentValue += Number(r.currentGross ?? r.totalPaid ?? 0);
    }
    let realizedProfit = 0;
    for (const s of soldRows) realizedProfit += Number(s.profit_try ?? 0);
    return { invested, currentValue, realizedProfit };
  }, [unified, soldRows]);

  async function sellRealPosition(row: UnifiedRow) {
    const r = realRows.find((x) => x.id === row.positionId);
    if (!r || !userId) {
      alert("Oturum veya pozisyon bulunamadı.");
      return;
    }
    const prop = propById[r.property_id];
    const salePx = prop ? getTerronSalePricePerM2(prop as TerronPropertyPricingInput, userId ?? "global") : 0;
    const m2 = Number(r.m2 ?? 0);
    if (!prop || salePx <= 0 || m2 <= 0) {
      alert("Satış için güncel satış tutarı veya m² bilgisi eksik.");
      return;
    }
    const quote = calculateSellQuoteTRY(salePx, m2);
    const paid = Number(r.total_paid ?? 0);
    const entry = paid > 0 ? Math.round(grossAssetFromTotalPaid(paid)) : null;
    const ok = window.confirm(
      `Satış özeti\n` +
        `• Brüt satış tutarı: ₺${formatTRY(Math.round(quote.grossSaleValue))}\n` +
        `• Satış komisyonu (%1): ₺${formatTRY(Math.round(quote.sellFee))}\n` +
        `• Hesaba geçecek net: ₺${formatTRY(Math.round(quote.netProceeds))}\n\n` +
        (entry != null
          ? `Giriş: arsa ₺${formatTRY(entry)} · toplam ödenen ₺${formatTRY(Math.round(paid))}\n\n`
          : `Toplam ödenen: ₺${formatTRY(Math.round(paid))}\n\n`) +
        `Onaylıyor musunuz?`
    );
    if (!ok) return;
    setSellingKey(row.key);
    try {
      const net = Math.round(quote.netProceeds);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        alert("Oturum süresi dolmuş olabilir. Yeniden giriş yapın.");
        return;
      }
      const res = await fetch("/api/portfolio/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ positionId: r.id }),
      });
      const raw = await res.text();
      let json: { ok?: boolean; error?: string; netProceeds?: number };
      try {
        json = JSON.parse(raw) as { ok?: boolean; error?: string; netProceeds?: number };
      } catch {
        alert(`Sunucu yanıtı okunamadı (${res.status}). Ağ veya yapılandırma hatası olabilir.`);
        return;
      }
      if (!res.ok || !json.ok) {
        alert(json.error ?? `Satış tamamlanamadı (${res.status}).`);
        return;
      }
      alert(
        `Satış tamamlandı. Hesaba geçen net: ₺${formatTRY(json.netProceeds ?? net)} (brüt üzerinden %1 satış komisyonu düşülmüştür).`
      );
      setRefresh((x) => x + 1);
    } finally {
      setSellingKey(null);
    }
  }

  return (
    <AppShell>
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          background: "radial-gradient(1200px 600px at 50% -10%, rgba(201,162,39,0.12), transparent 55%), #0a0f1a",
          color: "#fff",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px 14px 40px" }}>
          <h1 style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 950 }}>Portföy</h1>

          {!email && !loading ? (
            <div style={{ ...card, marginBottom: 16 }}>
              <span style={{ fontSize: 13, opacity: 0.85 }}>
                Pozisyonları görmek için{" "}
                <Link href="/login" style={{ color: "#7dd3fc" }}>
                  giriş yapın
                </Link>
                .
              </span>
            </div>
          ) : null}

          {/* Özet bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ ...card, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 800, letterSpacing: 0.3 }}>TOPLAM YATIRIM</div>
              <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>₺{formatTRY(totals.invested)}</div>
            </div>
            <div style={{ ...card, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 800, letterSpacing: 0.3 }}>GÜNCEL DEĞER</div>
              <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>₺{formatTRY(totals.currentValue)}</div>
            </div>
            <div style={{ ...card, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 800, letterSpacing: 0.3 }}>REALİZE KÂR</div>
              <div style={{ marginTop: 4 }}>
                <PnlText value={totals.realizedProfit} />
              </div>
            </div>
          </div>

          {/* Alt sekmeler */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 16,
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {(
              [
                { key: "aktif" as const, label: `Aktif (${unified.length})` },
                { key: "satilan" as const, label: `Satılan (${soldRows.length})` },
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "10px 4px",
                  marginRight: 20,
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === t.key ? "2px solid #F5D76E" : "2px solid transparent",
                  color: tab === t.key ? "#F5D76E" : "rgba(255,255,255,0.6)",
                  fontWeight: tab === t.key ? 900 : 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ fontSize: 14, opacity: 0.8 }}>Yükleniyor…</div>
          ) : tab === "aktif" ? (
            unified.length === 0 ? (
              <EmptyState
                title="Aktif pozisyonunuz yok"
                subtitle="Haritadan arsa satın alarak portföyünüzü oluşturmaya başlayın."
              />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {unified.map((row) => {
                  const busy = sellingKey === row.key;
                  return (
                    <div key={row.key} style={card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.3 }}>{row.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
                            {row.city} • {formatDate(row.created_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void sellRealPosition(row)}
                          style={{
                            flexShrink: 0,
                            padding: "8px 14px",
                            borderRadius: 12,
                            border: "1px solid rgba(245,215,110,0.45)",
                            background: busy ? "rgba(255,255,255,0.06)" : "rgba(245,215,110,0.14)",
                            color: "#fff",
                            fontWeight: 900,
                            fontSize: 12,
                            cursor: busy ? "not-allowed" : "pointer",
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          {busy ? "..." : "Sat"}
                        </button>
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>M²</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>
                            {row.m2 != null && row.m2 > 0 ? formatM2(row.m2) : "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>ÖDENEN</div>
                          <div style={{ fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                            {row.totalPaid != null ? formatTRY(Math.round(row.totalPaid)) : "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>KÂR/ZARAR</div>
                          <div style={{ marginTop: 2 }}>
                            <PnlText value={row.brutKz} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : soldRows.length === 0 ? (
            <EmptyState
              title="Henüz satış yok"
              subtitle="Sattığınız arsalar ve elde ettiğiniz kâr burada listelenecek."
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {soldRows.map((s) => (
                <div key={s.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.3 }}>
                        {s.property_title?.trim() || "Arsa"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
                        {s.city || "—"} • {formatDate(s.sold_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <PnlText value={Math.round(s.profit_try)} />
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          marginTop: 2,
                          color: s.profit_pct >= 0 ? "#86efac" : "#fca5a5",
                        }}
                      >
                        {s.profit_pct >= 0 ? "+" : ""}
                        {s.profit_pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>M²</div>
                      <div style={{ fontWeight: 800, marginTop: 2 }}>{formatM2(s.m2)}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>HESABA GEÇEN NET</div>
                      <div style={{ fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        ₺{formatTRY(Math.round(s.sell_net))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
