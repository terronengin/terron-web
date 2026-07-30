"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { CandlestickChart } from "@/app/components/CandlestickChart";
import { CHART_PERIODS, computeCandles } from "@/lib/candlestick";
import { getCachedProperties } from "@/lib/propertiesCache";
import { getDailyChangePct } from "@/lib/priceTrend";
import { getTerronSalePricePerM2 } from "@/lib/propertySalePrice";
import type { PropertyRow } from "@/lib/terron/propertyRow";
import { AppShell } from "../components/AppShell";

function formatPct(n: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

function PctBadge({ value, size = 12.5 }: { value: number; size?: number }) {
  const positive = value >= 0;
  return (
    <span
      style={{ color: positive ? "#16A34A" : "#DC2626", fontWeight: 800, fontSize: size, fontVariantNumeric: "tabular-nums" }}
    >
      {formatPct(value)}
    </span>
  );
}

function formatTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatM2(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function initialOf(s: string) {
  return (s?.trim()?.[0] ?? "A").toUpperCase();
}

/** Başlıktan deterministik, sakin bir amblem rengi. */
function emblemColor(seed: string): string {
  const palette = ["#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#6366F1"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 4px",
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  color: "#0F172A",
  background: "transparent",
  border: "none",
};

const selectStyle: React.CSSProperties = {
  height: 38,
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid rgba(15,23,42,0.12)",
  color: "#0F172A",
  fontSize: 12,
  padding: "0 8px",
};

export default function MarketPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PropertyRow[]>([]);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(90);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await getCachedProperties();
        if (!cancelled) setItems(rows);
      } catch (e) {
        console.warn("[market] fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.city) set.add(it.city);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [items]);

  /** İl bazında ortalama alım yoğunluğu (satılan/toplam m²) — bölgede alım çoksa trend buna göre güçlensin. */
  const cityDemand = useMemo(() => {
    const sums = new Map<string, { sum: number; n: number }>();
    for (const it of items) {
      const total = Number(it.total_area_m2 ?? 0);
      if (total <= 0) continue;
      const ratio = Math.max(0, Math.min(1, Number(it.sold_m2 ?? 0) / total));
      const key = it.city ?? "";
      const cur = sums.get(key) ?? { sum: 0, n: 0 };
      cur.sum += ratio;
      cur.n += 1;
      sums.set(key, cur);
    }
    const out = new Map<string, number>();
    for (const [k, v] of sums) out.set(k, v.n > 0 ? v.sum / v.n : 0);
    return out;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (city && it.city !== city) return false;
      if (!q) return true;
      const hay = `${it.title} ${it.city} ${it.district ?? ""} ${it.neighborhood ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, city]);

  return (
    <AppShell>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#FFFFFF", color: "#0F172A" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 16px 40px" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 800 }}>Market</h1>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara... (başlık, il, ilçe)"
              style={{
                flex: 1,
                height: 38,
                borderRadius: 12,
                background: "#FFFFFF",
                border: "1px solid rgba(15,23,42,0.12)",
                color: "#0F172A",
                padding: "0 12px",
                fontSize: 13,
                outline: "none",
              }}
            />
            <select value={city} onChange={(e) => setCity(e.target.value)} style={{ ...selectStyle, minWidth: 120 }}>
              <option value="">Tüm iller</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 4px",
              fontSize: 10.5,
              fontWeight: 700,
              color: "rgba(15,23,42,0.45)",
              letterSpacing: 0.3,
              borderBottom: "1px solid rgba(15,23,42,0.08)",
            }}
          >
            <span>ARSA</span>
            <span style={{ display: "flex", gap: 24 }}>
              <span>24S DEĞİŞİM</span>
              <span>FİYAT</span>
            </span>
          </div>

          {loading ? (
            <div style={{ fontSize: 14, opacity: 0.6, padding: 20, textAlign: "center" }}>Yükleniyor…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 14, opacity: 0.6, padding: 20, textAlign: "center" }}>
              Aramanızla eşleşen ilan bulunamadı.
            </div>
          ) : (
            <div>
              {filtered.slice(0, 200).map((it) => {
                const total = Number(it.total_area_m2 ?? 0);
                const available = it.available_m2 != null ? Number(it.available_m2) : total;
                const px = getTerronSalePricePerM2(it, "market");
                const regionDemand = cityDemand.get(it.city ?? "") ?? 0;
                const dailyPct = getDailyChangePct(it, "market", regionDemand);
                const isExpanded = expandedId === it.id;
                const candles = isExpanded ? computeCandles(it, "market", periodDays, regionDemand) : [];
                const periodPct =
                  candles.length > 1 ? ((candles[candles.length - 1]!.close - candles[0]!.open) / candles[0]!.open) * 100 : 0;

                return (
                  <div key={it.id} style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : it.id)}
                      style={row}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: emblemColor(it.city ?? it.title),
                          color: "white",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {initialOf(it.city ?? it.title)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13.5,
                            lineHeight: 1.25,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.title}
                        </div>
                        <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 1 }}>
                          {it.city}
                          {it.district ? ` / ${it.district}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <PctBadge value={dailyPct} />
                        <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 2 }}>₺{formatTRY(px)}</div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div style={{ padding: "0 4px 16px" }}>
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
                          {CHART_PERIODS.map((p) => (
                            <button
                              key={p.key}
                              onClick={() => setPeriodDays(p.days)}
                              style={{
                                flexShrink: 0,
                                padding: "5px 12px",
                                borderRadius: 999,
                                border:
                                  periodDays === p.days ? "1px solid rgba(184,134,11,0.4)" : "1px solid rgba(15,23,42,0.1)",
                                background: periodDays === p.days ? "rgba(184,134,11,0.1)" : "#FFFFFF",
                                color: periodDays === p.days ? "#8A6A0A" : "rgba(15,23,42,0.6)",
                                fontSize: 11.5,
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, opacity: 0.55, fontWeight: 700 }}>
                            Seçili dönem ({CHART_PERIODS.find((p) => p.days === periodDays)?.label ?? ""}):
                          </span>
                          <PctBadge value={periodPct} size={14} />
                        </div>

                        <div
                          style={{
                            borderRadius: 12,
                            border: "1px solid rgba(15,23,42,0.08)",
                            padding: "10px 6px 6px",
                          }}
                        >
                          <CandlestickChart candles={candles} />
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <div style={{ opacity: 0.5, fontSize: 10, fontWeight: 700 }}>TOPLAM M²</div>
                            <div style={{ fontWeight: 800, marginTop: 2 }}>{formatM2(total)}</div>
                          </div>
                          <div>
                            <div style={{ opacity: 0.5, fontSize: 10, fontWeight: 700 }}>KALAN M²</div>
                            <div style={{ fontWeight: 800, marginTop: 2 }}>{formatM2(available)}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => router.push(`/dashboard?p=${it.id}`)}
                          style={{
                            width: "100%",
                            marginTop: 12,
                            padding: "12px 0",
                            borderRadius: 14,
                            border: "none",
                            background: "linear-gradient(135deg, #e8d48a, #c9a227)",
                            color: "#0a0f1a",
                            fontWeight: 800,
                            fontSize: 13.5,
                            cursor: "pointer",
                          }}
                        >
                          Detayları Gör / Satın Al
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
