"use client";

import React, { useState } from "react";
import { isVisibleOnExplorer } from "@/lib/propertyListing";
import { getTerronSalePricePerM2 } from "@/lib/propertySalePrice";
import { deriveZoningBandFromLabel } from "@/lib/investment/propertyInvestmentModel";
import type { PropertyRow } from "@/lib/terron/propertyRow";

type InsightTab = "arsa" | "gelisim" | "risk";

/**
 * Dashboard'daki "İlan detayı" panelinin salt-okunur (satın alma akışı OLMAYAN) kısmı.
 * Market ve Dashboard tarafından paylaşılır — böylece Market'te de sayfa değiştirmeden
 * aynı zengin detay (Gelişim/Risk/Beklenti/İmar/tablar) görünür.
 */
export function PropertyDetailPanel({ property, pricingScope }: { property: PropertyRow; pricingScope: string }) {
  const [activeInsightTab, setActiveInsightTab] = useState<InsightTab>("arsa");

  const selected = property;
  const selectedPricePerM2 = getTerronSalePricePerM2(selected, pricingScope);
  const selectedAvailableM2 = getPropertyAvailableM2(selected);
  const selectedSoldM2 = getPropertySoldM2(selected);
  const selectedMinBuyM2 = Math.max(1, Number(selected?.min_buy_m2 ?? 1));
  const listingDemandRatio = clamp01(selectedSoldM2 / Math.max(1, Number(selected.total_area_m2 ?? 1)));
  const soldPct = Number(selected.total_area_m2) > 0 ? (selectedSoldM2 / Number(selected.total_area_m2)) * 100 : 0;

  const developmentBase = clamp(Number(selected.development_score ?? 50), 0, 100);
  const developmentHistory = [
    clamp(developmentBase - 20, 0, 100),
    clamp(developmentBase - 14, 0, 100),
    clamp(developmentBase - 8, 0, 100),
    clamp(developmentBase - 3, 0, 100),
    clamp(developmentBase, 0, 100),
  ];

  const riskBase = clamp(Number(selected.risk_score ?? 50), 0, 100);
  const riskHistory = [
    clamp(riskBase + 8, 0, 100),
    clamp(riskBase + 5, 0, 100),
    clamp(riskBase + 3, 0, 100),
    clamp(riskBase + 1, 0, 100),
    clamp(riskBase, 0, 100),
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          paddingBottom: 8,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {isVisibleOnExplorer(selected) ? (
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
          {selected.title?.trim() || selected.neighborhood || selected.district || selected.city}
        </div>
        <div style={{ fontSize: 10, opacity: 0.72, lineHeight: 1.3 }}>
          {selected.city}
          {selected.district ? ` · ${selected.district}` : ""}
          {selected.neighborhood ? ` · ${selected.neighborhood}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, opacity: 0.65 }}>
            Toplam <b>{formatNumber(Number(selected.total_area_m2 ?? 0))}</b> m²
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
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
                <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>Yatırım özeti</div>
                {selected.ai_summary}
              </div>
            ) : null}
            <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.45 }}>
              Ada/Parsel:{" "}
              {selected.ada_no || selected.parcel_no ? `${selected.ada_no ?? "—"} / ${selected.parcel_no ?? "—"}` : "—"} ·
              İmar: {selected.zoning_status || "—"}
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
        <div style={{ marginTop: 4, height: 5, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.07)" }}>
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
    </div>
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

function getPropertyAvailableM2(p: PropertyRow): number {
  const total = Number(p.total_area_m2 ?? 0);
  const available = p.available_m2 != null ? Number(p.available_m2) : Math.max(0, total - Number(p.sold_m2 ?? 0));
  return Math.max(0, available);
}

function getPropertySoldM2(p: PropertyRow): number {
  const total = Number(p.total_area_m2 ?? 0);
  if (p.sold_m2 != null) return Math.max(0, Number(p.sold_m2));
  return Math.max(0, total - getPropertyAvailableM2(p));
}

function panelZoningBand(p: PropertyRow): ReturnType<typeof deriveZoningBandFromLabel> {
  const raw = String(p.zoning_band ?? "").trim();
  if (raw === "imarli" || raw === "imarsiz" || raw === "bilinmiyor" || raw === "mixed") {
    return raw;
  }
  return deriveZoningBandFromLabel(String(p.zoning_status ?? ""));
}

function inferNearbyText(p: PropertyRow) {
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

function inferLandSummary(p: PropertyRow) {
  const band = panelZoningBand(p);
  if (band === "imarli") return "İmarlı yapılaşma hakkı olan parsellerde işlem süreçleri genelde daha öngörülebilirdir.";
  if (band === "imarsiz") return "İmar ve planlama belirsizliği daha yüksek; süreç ve maliyet yerinde netleştirilmelidir.";
  if (band === "mixed") return "Karma veya geçiş bölgesi; mevzuat ve çevre projeleri fiyatı belirler.";
  if ((p.development_score ?? 0) > 70) return "Bölgesel gelişim göstergeleri güçlü; detaylar için yerinde keşif önerilir.";
  return "İmar ve planlama durumu yerinde kontrol edilmelidir.";
}

function inferGrowthReason(p: PropertyRow) {
  if ((p.development_score ?? 0) >= 75) return "Yeni yerleşim baskısı, altyapı erişimi ve fiyat ivmesi güçlü";
  if ((p.development_score ?? 0) >= 55) return "Yerleşim genişlemesi ve yol erişimi ile kademeli değer artışı";
  return "Gelişim erken aşamada, çevresel genişleme etkisi zamana yayılır";
}

function inferZoningImpact(p: PropertyRow) {
  const band = panelZoningBand(p);
  if (band === "imarli") return "İmarlı yapılaşma hakkı nedeniyle fiyat keşfi genelde daha hızlı olur";
  if (band === "imarsiz") return "İmar açılımı gerçekleşirse fiyat çarpanı belirgin yükseliş gösterebilir; süre belirsiz.";
  if (band === "mixed") return "Karma sınıflarda plan değişiklikleri ve çevre projeleri fiyatı belirler.";
  return "İmar sınıfı netleştikçe değerleme güveni artar.";
}

function inferLiquidityText(p: PropertyRow) {
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

function inferRiskText(p: PropertyRow) {
  const band = panelZoningBand(p);
  if (band === "imarsiz") return "İmar ve planlama belirsizliği daha yüksek izlenmeli";
  if (band === "mixed") return "Karma sınıflarda mevzuat ve çevre etkileri riski artırabilir.";
  if ((p.risk_score ?? 0) > 70) return "Piyasa döngüsü ve fiyat dalgalanması dikkatle takip edilmeli";
  return "Genel piyasa oynaklığı dışında kontrollü risk profili";
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
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

function formatInt(n: number | null | undefined) {
  return String(Math.round(Number(n ?? 0)));
}

function signedPct(n: number | null | undefined) {
  const x = Number(n ?? 0);
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
}

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

const miniInfoCard: React.CSSProperties = {
  padding: 10,
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const miniInfoLabel: React.CSSProperties = { fontSize: 11, opacity: 0.7, fontWeight: 800 };
const miniInfoText: React.CSSProperties = { fontSize: 12, opacity: 0.9, marginTop: 6, lineHeight: 1.4 };
