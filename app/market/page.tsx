"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { getCachedProperties } from "@/lib/propertiesCache";
import { getTerronSalePricePerM2 } from "@/lib/propertySalePrice";
import type { PropertyRow } from "@/lib/terron/propertyRow";
import { AppShell } from "../components/AppShell";

function formatTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatM2(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
  padding: 14,
  textAlign: "left",
  cursor: "pointer",
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
                return (
                  <button key={it.id} style={card} onClick={() => router.push(`/dashboard?p=${it.id}`)}>
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
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
