"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";

const card: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,22,44,0.72)",
  padding: 22,
  boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
};

const stepNum: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  fontSize: 14,
  background: "rgba(245,215,110,0.14)",
  border: "1px solid rgba(245,215,110,0.35)",
  flexShrink: 0,
};

export default function InquiriesInfoPage() {
  const router = useRouter();

  return (
    <AppShell>
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        background: "linear-gradient(180deg, #031326 0%, #071a33 100%)",
        color: "white",
        padding: "28px 16px 56px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.75, fontWeight: 700, letterSpacing: 1.2 }}>
          TERRON • GERÇEK İLAN
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 950, margin: 0, lineHeight: 1.15 }}>
          Talep &amp; satış süreci
        </h1>
        <p style={{ marginTop: 14, fontSize: 15, opacity: 0.86, lineHeight: 1.6, maxWidth: 720 }}>
          Onaylı ilanlarda <b>resmi talep hattı</b> kullanılır. Talebiniz kayda alınır, satış ekibi tarafından yönetilir ve
          ilan sahibi ile eşleştirilir. Bu aşamada <b>platform üzerinden ödeme veya ön provizyon</b> zorunlu değildir.
        </p>

        <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>Nasıl işliyor?</div>
            <div style={{ display: "grid", gap: 16 }}>
              {[
                {
                  t: "Talep oluşturun",
                  d: "Dashboard’da ilanı açıp ad, telefon ve tercihlerinizle kısa bir talep bırakın. İsteğe bağlı m² ve bütçe bilgisi verebilirsiniz.",
                },
                {
                  t: "Satış ekibi değerlendirir",
                  d: "Talepler yönetim panelinde sıraya alınır; durumlar “yeni → iletişim → pazarlık → sonuç” şeklinde takip edilir.",
                },
                {
                  t: "İlan sahibi ile eşleştirme",
                  d: "Uygun görüldüğünde ilan sahibi iletişim bilgileri üzerinden veya Terron satış hattı ile süreç ilerletilir.",
                },
                {
                  t: "Resmi süreç",
                  d: "Tapu, sözleşme ve ödeme planı gibi adımlar yüz yüze / noter / banka kanallarında yürütülür; platform üzerinden zorunlu ödeme alınmaz.",
                },
              ].map((x, i) => (
                <div key={x.t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={stepNum}>{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 4 }}>{x.t}</div>
                    <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.55 }}>{x.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, borderColor: "rgba(56,189,248,0.22)", background: "rgba(10,22,44,0.85)" }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Bilgilendirme</div>
            <p style={{ fontSize: 14, opacity: 0.86, lineHeight: 1.65, margin: 0 }}>
              Harita ve metrikler yatırım kararını desteklemek içindir; <b>bağlayıcı teklif değildir</b>. Kesin koşullar
              sözleşme ve tapu süreçlerinde netleşir. Sorularınız için talep formundaki mesaj alanını kullanabilirsiniz.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              style={{
                padding: "12px 20px",
                borderRadius: 14,
                border: "none",
                background: "linear-gradient(92deg, rgba(56,189,248,0.9), rgba(245,215,110,0.85))",
                color: "#031326",
                fontWeight: 950,
                cursor: "pointer",
              }}
            >
              İlanlara dön
            </button>
            <button
              type="button"
              onClick={() => router.push("/submit-property")}
              style={{
                padding: "12px 20px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "#e2e8f0",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              İlan ver
            </button>
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
