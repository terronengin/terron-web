"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useId, useMemo, useState } from "react";
import { getCachedProperties } from "@/lib/propertiesCache";
import { computeTrendSeries, getDailyChangePct, TREND_PERIODS } from "@/lib/priceTrend";
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
      style={{ color: positive ? "#86efac" : "#fca5a5", fontWeight: 900, fontSize: size, fontVariantNumeric: "tabular-nums" }}
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

/** Borsa uygulamalarındaki gibi basit çizgi grafiği — harici kütüphane olmadan, hafif SVG. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const gradId = useId().replace(/:/g, "");
  const w = 100;
  const h = 34;
  const pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return [x, y] as const;
  });
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const last = coords[coords.length - 1]!;
  const first = coords[0]!;
  const areaPath = `${linePath} L${last[0].toFixed(2)},${h - pad} L${first[0].toFixed(2)},${h - pad} Z`;
  const color = positive ? "#86efac" : "#fca5a5";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={64} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
  padding: 14,
  textAlign: "left",
  color: "white",
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  height: 38,
  borderRadius: 12,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
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
  const [periodDays, setPeriodDays] = useState<number>(30);

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
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#070B14", color: "white" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 12px 40px" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 950 }}>Market</h1>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara... (başlık, il, ilçe)"
              style={{
                flex: 1,
                height: 38,
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
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

          {loading ? (
            <div style={{ fontSize: 14, opacity: 0.75, padding: 20, textAlign: "center" }}>Yükleniyor…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 14, opacity: 0.75, padding: 20, textAlign: "center" }}>
              Aramanızla eşleşen ilan bulunamadı.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.slice(0, 200).map((it) => {
                const total = Number(it.total_area_m2 ?? 0);
                const available = it.available_m2 != null ? Number(it.available_m2) : total;
                const px = getTerronSalePricePerM2(it, "market");
                const regionDemand = cityDemand.get(it.city ?? "") ?? 0;
                const dailyPct = getDailyChangePct(it, "market", regionDemand);
                const isExpanded = expandedId === it.id;
                const series = isExpanded ? computeTrendSeries(it, "market", regionDemand) : null;
                const periodPct = series ? series.changeOver(periodDays) : 0;
                const chartPoints = series ? series.index.slice(-Math.min(periodDays + 1, series.index.length)) : [];

                return (
                  <div key={it.id} style={card}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard?p=${it.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") router.push(`/dashboard?p=${it.id}`);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.3 }}>{it.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
                            {it.city}
                            {it.district ? ` / ${it.district}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 14, color: "#F5D76E" }}>₺{formatTRY(px)}</div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>/m²</div>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>TOPLAM M²</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>{formatM2(total)}</div>
                        </div>
                        <div>
                          <div style={{ opacity: 0.6, fontSize: 10, fontWeight: 800 }}>KALAN M²</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>{formatM2(available)}</div>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ opacity: 0.7, fontWeight: 700 }}>24 saat</span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : it.id);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: isExpanded ? "rgba(245,215,110,0.16)" : "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "white",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Detay
                        <span style={{ fontSize: 9, opacity: 0.8 }}>{isExpanded ? "▴" : "▾"}</span>
                      </button>

                      <PctBadge value={dailyPct} />
                    </div>

                    {isExpanded && series ? (
                      <div
                        style={{
                          marginTop: 8,
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.08)",
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                          {TREND_PERIODS.map((p) => (
                            <button
                              key={p.key}
                              onClick={() => setPeriodDays(p.days)}
                              style={{
                                flexShrink: 0,
                                padding: "6px 12px",
                                borderRadius: 999,
                                border:
                                  periodDays === p.days
                                    ? "1px solid rgba(245,215,110,0.55)"
                                    : "1px solid rgba(255,255,255,0.1)",
                                background: periodDays === p.days ? "rgba(245,215,110,0.14)" : "rgba(255,255,255,0.04)",
                                color: periodDays === p.days ? "#F5D76E" : "rgba(255,255,255,0.75)",
                                fontSize: 11.5,
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 700 }}>
                            Seçili dönem ({TREND_PERIODS.find((p) => p.days === periodDays)?.label ?? ""}):
                          </span>
                          <PctBadge value={periodPct} size={15} />
                        </div>

                        <Sparkline points={chartPoints} positive={periodPct >= 0} />
                      </div>
                    ) : null}
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
