"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { formatM2 } from "@/lib/formatM2";
import { calculateSellQuoteTRY, grossAssetFromTotalPaid } from "@/lib/sim/realEstatePrice";
import { getTerronSalePricePerM2, type TerronPropertyPricingInput } from "@/lib/propertySalePrice";

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

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [realRows, setRealRows] = useState<RealPositionRow[]>([]);
  const [propById, setPropById] = useState<Record<string, PropertyLite>>({});
  const [refresh, setRefresh] = useState(0);
  const [sellingKey, setSellingKey] = useState<string | null>(null);

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
        setLoading(false);
        return;
      }

      const positions = (posData ?? []) as RealPositionRow[];
      setRealRows(positions);

      const ids = [...new Set(positions.map((p) => p.property_id).filter(Boolean))];
      if (ids.length === 0) {
        setPropById({});
        setLoading(false);
        return;
      }

      const { data: propData, error: propErr } = await supabase
        .from("properties")
        .select(
          "id,title,city,price_per_m2,total_area_m2,available_m2,sold_m2,development_score,last_30d_change,quality_score,risk_score,rental_yield_annual,min_buy_m2,total_shares"
        )
        .in("id", ids);

      if (cancelled) return;
      if (propErr) {
        console.warn("[portfolio] properties:", propErr.message);
        setPropById({});
      } else {
        const map: Record<string, PropertyLite> = {};
        for (const p of (propData ?? []) as PropertyLite[]) {
          map[p.id] = p;
        }
        setPropById(map);
      }
      setLoading(false);
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
      const salePx = prop ? getTerronSalePricePerM2(prop, scope) : 0;
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
        if (paid > 0) {
          netVsPaid = Math.round(q.netProceeds - paid);
        }
        if (entryGross != null && entryGross > 0) {
          brutKz = Math.round(q.grossSaleValue - entryGross);
        }
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

  async function sellRealPosition(row: UnifiedRow) {
    const r = realRows.find((x) => x.id === row.positionId);
    if (!r || !userId) {
      alert("Oturum veya pozisyon bulunamadı.");
      return;
    }
    const prop = propById[r.property_id];
    const salePx = prop ? getTerronSalePricePerM2(prop, userId ?? "global") : 0;
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "radial-gradient(1200px 600px at 50% -10%, rgba(201,162,39,0.12), transparent 55%), #0a0f1a",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.75, color: "#c9a227" }}>
          TERRON
        </div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 26, fontWeight: 950, lineHeight: 1.2 }}>Portföy</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, opacity: 0.88 }}>
          <strong>Alım:</strong> arsa tutarı (satış tutarı × m²) + %0,5 alım komisyonu = cüzdandan düşen toplam.{" "}
          <strong>Satış:</strong> brüt satış − %1 satış komisyonu = hesaba geçen net. K/Z sütunları tahmini net üzerinden
          hesaplanır.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 14,
            background: "rgba(245,215,110,0.08)",
            border: "1px solid rgba(245,215,110,0.25)",
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8, color: "#fef9c3" }}>Satış hesap özeti (örnek)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, maxWidth: 420, opacity: 0.95 }}>
            <span>Brüt satış tutarı</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>100.000 ₺</span>
            <span>Satış komisyonu (%1)</span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>− 1.000 ₺</span>
            <span style={{ fontWeight: 800 }}>Hesaba geçecek net</span>
            <span style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>99.000 ₺</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
            150.000 ₺ brüt → 1.500 ₺ komisyon → 148.500 ₺ net. Sat butonunda onay penceresinde güncel rakamlar gösterilir.
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 14,
              fontWeight: 800,
              textDecoration: "none",
              color: "#0a0f1a",
              background: "linear-gradient(135deg, #e8d48a, #c9a227)",
              border: "1px solid rgba(245,215,110,0.5)",
            }}
          >
            Panele git
          </Link>
          {!email && !loading ? (
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              Pozisyonları görmek için{" "}
              <Link href="/login" style={{ color: "#7dd3fc" }}>
                giriş yapın
              </Link>
              .
            </span>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 28,
            borderRadius: 22,
            padding: 20,
            background: "rgba(12,20,38,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          }}
        >
          {loading ? (
            <div style={{ fontSize: 14, opacity: 0.8 }}>Yükleniyor…</div>
          ) : unified.length === 0 ? (
            <div style={{ fontSize: 14, opacity: 0.82, lineHeight: 1.5 }}>
              Henüz kayıtlı pozisyon yok. Dashboard üzerinden arsa alabilirsiniz.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 0, overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(120px,1.1fr) minmax(76px,0.6fr) 44px minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) 56px",
                  gap: 8,
                  paddingBottom: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  opacity: 0.65,
                  minWidth: 980,
                }}
              >
                <div>İlan</div>
                <div>Tarih</div>
                <div>m²</div>
                <div style={{ textAlign: "right" }}>Arsa</div>
                <div style={{ textAlign: "right" }}>Ödenen</div>
                <div style={{ textAlign: "right" }}>Güncel brüt</div>
                <div style={{ textAlign: "right" }}>Brüt K/Z</div>
                <div style={{ textAlign: "right" }}>Tahm. net</div>
                <div style={{ textAlign: "right" }}>Satış kom.</div>
                <div style={{ textAlign: "right" }}>Nakit K/Z</div>
                <div />
              </div>
              {unified.map((row) => {
                const busy = sellingKey === row.key;
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(120px,1.1fr) minmax(76px,0.6fr) 44px minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) minmax(72px,0.65fr) 56px",
                      gap: 8,
                      padding: "12px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 12,
                      alignItems: "start",
                      minWidth: 980,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, lineHeight: 1.35 }}>{row.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4 }}>{row.city}</div>
                      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>{row.flowLabel}</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>{formatDate(row.created_at)}</div>
                    <div>{row.m2 != null && row.m2 > 0 ? formatM2(row.m2) : "—"}</div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.entryGross != null ? formatTRY(row.entryGross) : "—"}
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.totalPaid != null && row.totalPaid > 0 ? formatTRY(Math.round(row.totalPaid)) : "—"}
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.currentGross != null ? formatTRY(row.currentGross) : "—"}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color:
                          row.brutKz == null
                            ? "rgba(255,255,255,0.5)"
                            : row.brutKz >= 0
                              ? "#86efac"
                              : "#fca5a5",
                        fontWeight: 800,
                      }}
                    >
                      {row.brutKz != null ? `${row.brutKz >= 0 ? "+" : ""}${formatTRY(row.brutKz)}` : "—"}
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {row.sellNetTry != null ? formatTRY(row.sellNetTry) : "—"}
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.92 }}>
                      {row.sellFeeTry != null ? formatTRY(row.sellFeeTry) : "—"}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color:
                          row.netVsPaid == null
                            ? "rgba(255,255,255,0.5)"
                            : row.netVsPaid >= 0
                              ? "#86efac"
                              : "#fca5a5",
                        fontWeight: 800,
                      }}
                    >
                      {row.netVsPaid != null ? `${row.netVsPaid >= 0 ? "+" : ""}${formatTRY(row.netVsPaid)}` : "—"}
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sellRealPosition(row)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(245,215,110,0.45)",
                          background: busy ? "rgba(255,255,255,0.06)" : "rgba(245,215,110,0.12)",
                          color: "#fff",
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.65 : 1,
                        }}
                      >
                        Sat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
