"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { buyFeeFromTotalPaid } from "@/lib/admin/analytics";
import { formatM2 } from "@/lib/formatM2";
import { calculateSellQuoteTRY } from "@/lib/sim/realEstatePrice";

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
  total: number | null;
  /** Tahmini net satış (liste × m² − %1) */
  sellNetTry: number | null;
  /** Ödenen tutardaki alım komisyonu (model: total_paid üzerinden) */
  buyFeeTry: number | null;
  /** Tahmini satış komisyonu toplamı (brüt × %1) */
  sellFeeTry: number | null;
  flowLabel: string;
  unrealizedPl: number | null;
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
        .select("id,title,city,price_per_m2,available_m2,sold_m2")
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
    return realRows.map((r) => {
      const prop = propById[r.property_id];
      const title = prop?.title?.trim() || `İlan ${r.property_id.slice(0, 8)}…`;
      const city = prop?.city?.trim() || "—";
      const m2 = Number(r.m2 ?? 0);
      const paid = Number(r.total_paid ?? 0);
      const px = prop?.price_per_m2 != null ? Number(prop.price_per_m2) : NaN;
      let unrealizedPl: number | null = null;
      let sellNetTry: number | null = null;
      let buyFeeTry: number | null = null;
      let sellFeeTry: number | null = null;
      if (Number.isFinite(px) && px > 0 && m2 > 0) {
        const q = calculateSellQuoteTRY(px, m2);
        sellNetTry = Math.round(q.netProceeds);
        sellFeeTry = Math.round(q.sellFee);
        if (paid > 0) {
          unrealizedPl = Math.round(q.netProceeds - paid);
          buyFeeTry = Math.round(buyFeeFromTotalPaid(paid));
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
        total: r.total_paid,
        sellNetTry,
        buyFeeTry,
        sellFeeTry,
        flowLabel: "Pozisyon",
        unrealizedPl,
      } satisfies UnifiedRow;
    });
  }, [realRows, propById]);

  async function sellRealPosition(row: UnifiedRow) {
    const r = realRows.find((x) => x.id === row.positionId);
    if (!r || !userId) {
      alert("Oturum veya pozisyon bulunamadı.");
      return;
    }
    const prop = propById[r.property_id];
    const px = prop?.price_per_m2 != null ? Number(prop.price_per_m2) : NaN;
    const m2 = Number(r.m2 ?? 0);
    if (!Number.isFinite(px) || px <= 0 || m2 <= 0) {
      alert("Satış için güncel fiyat veya m² bilgisi eksik.");
      return;
    }
    const quote = calculateSellQuoteTRY(px, m2);
    const paid = Number(r.total_paid ?? 0);
    const ok = window.confirm(
      `Satış: brüt ₺${formatTRY(Math.round(quote.grossSaleValue))}, ` +
        `satış komisyonu %1 sonrası tahmini net ₺${formatTRY(Math.round(quote.netProceeds))}. ` +
        `Maliyetiniz ₺${formatTRY(Math.round(paid))}. Devam?`
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
        `Satış tamam. Net tahmini: ₺${formatTRY(json.netProceeds ?? net)} (komisyon %1 düşülmüş). ` +
          `İlandaki satılabilir m² ve satılan m² güncellendi.`
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
          Onaylı ilanlarınızdan oluşan pozisyonlar. Komisyonlar pozisyon m² ile çarpılır (ör. liste 20.000 ₺/m² iken alımda
          ~100 ₺/m² %0,5, satış brütünde ~200 ₺/m² %1). K/Z, tahmini net satış ve komisyon sütunları buna göre hesaplanır.
        </p>

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
                  gridTemplateColumns: "minmax(140px,1.2fr) minmax(100px,0.75fr) 52px 72px 88px 72px 72px",
                  gap: 8,
                  paddingBottom: 10,
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  opacity: 0.65,
                  minWidth: 640,
                }}
              >
                <div>İlan</div>
                <div>Tarih</div>
                <div>m²</div>
                <div>Maliyet</div>
                <div>K/Z</div>
                <div>Alım ü.</div>
                <div>İşlem</div>
              </div>
              {unified.map((row) => {
                const busy = sellingKey === row.key;
                return (
                  <div
                    key={row.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(120px,1.1fr) minmax(80px,0.65fr) 44px 70px 64px 76px 60px 60px 64px",
                      gap: 8,
                      padding: "12px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 13,
                      alignItems: "start",
                      minWidth: 760,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, lineHeight: 1.35 }}>{row.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4 }}>{row.city}</div>
                      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>{row.flowLabel}</div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{formatDate(row.created_at)}</div>
                    <div>{row.m2 != null && row.m2 > 0 ? formatM2(row.m2) : "—"}</div>
                    <div>{row.total != null && row.total > 0 ? formatTRY(row.total) : "—"}</div>
                    <div
                      style={{
                        color:
                          row.unrealizedPl == null
                            ? "rgba(255,255,255,0.5)"
                            : row.unrealizedPl >= 0
                              ? "#86efac"
                              : "#fca5a5",
                        fontWeight: 800,
                      }}
                    >
                      {row.unrealizedPl != null
                        ? `${row.unrealizedPl >= 0 ? "+" : ""}${formatTRY(row.unrealizedPl)}`
                        : "—"}
                    </div>
                    <div style={{ fontSize: 12 }}>{row.sellNetTry != null ? formatTRY(row.sellNetTry) : "—"}</div>
                    <div style={{ fontSize: 12, opacity: 0.92 }}>{row.buyFeeTry != null ? formatTRY(row.buyFeeTry) : "—"}</div>
                    <div style={{ fontSize: 12, opacity: 0.92 }}>{row.sellFeeTry != null ? formatTRY(row.sellFeeTry) : "—"}</div>
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
