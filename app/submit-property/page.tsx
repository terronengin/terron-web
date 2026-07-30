"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { AppShell } from "../components/AppShell";

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.14)",
  background: "#FFFFFF",
  color: "#0F172A",
  fontSize: 14,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.85,
  marginBottom: 6,
  letterSpacing: 0.3,
};

export default function SubmitPropertyPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState("");
  const [country, setCountry] = useState("Türkiye");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [listingDescription, setListingDescription] = useState("");
  const [totalM2, setTotalM2] = useState("");
  const [availableM2, setAvailableM2] = useState("");
  const [minBuy, setMinBuy] = useState("1");
  const [maxBuy, setMaxBuy] = useState("");
  const [priceM2, setPriceM2] = useState("");
  const [zoning, setZoning] = useState("imarli");
  const [adaNo, setAdaNo] = useState("");
  const [parcelNo, setParcelNo] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [deedUrl, setDeedUrl] = useState("");
  const [manualCoords, setManualCoords] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const card: React.CSSProperties = useMemo(
    () => ({
      borderRadius: 22,
      border: "1px solid rgba(15,23,42,0.08)",
      background: "#FFFFFF",
      padding: 22,
      boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
    }),
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const total = Number(totalM2);
    const avail = Number(availableM2);
    const ppm = Number(priceM2);
    const minB = Math.max(1, Number(minBuy) || 1);
    const maxB = Number(maxBuy || avail);

    if (!title.trim()) {
      setError("Başlık girin.");
      return;
    }
    if (!city.trim() || !district.trim()) {
      setError("Şehir ve ilçe zorunludur.");
      return;
    }
    if (!addressLine.trim() && !manualCoords) {
      setError("Açık adres girin (sokak, cadde, numara).");
      return;
    }
    if (!manualCoords && addressLine.trim().length < 8) {
      setError("Açık adresi daha detaylı yazın (en az 8 karakter).");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError("Toplam m² geçerli bir sayı olmalı.");
      return;
    }
    if (!Number.isFinite(avail) || avail < 0 || avail > total) {
      setError("Satılabilir m², 0 ile toplam m² arasında olmalı.");
      return;
    }
    if (!ownerName.trim() || !ownerPhone.trim() || !ownerEmail.trim()) {
      setError("Sahip adı, telefon ve e-posta zorunludur.");
      return;
    }
    if (!Number.isFinite(ppm) || ppm <= 0) {
      setError("m² fiyatı pozitif olmalı.");
      return;
    }
    if (minB > avail) {
      setError("Minimum alım, satılabilir m²’den büyük olamaz.");
      return;
    }
    if (maxB < minB || maxB > avail) {
      setError("Maksimum alım, min alım ile satılabilir m² arasında olmalı.");
      return;
    }
    if (manualCoords) {
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) {
        setError("Manuel enlem ve boylam girin.");
        return;
      }
    }

    const sessionEmail = (await supabase.auth.getUser()).data.user?.email ?? ownerEmail.trim();

    const payload: Record<string, unknown> = {
      title: title.trim(),
      country: country.trim() || "Türkiye",
      city: city.trim(),
      district: district.trim(),
      neighborhood: neighborhood.trim(),
      address_line: addressLine.trim(),
      listing_description: listingDescription.trim(),
      total_area_m2: total,
      available_m2: avail,
      min_buy_m2: minB,
      max_buy_m2: Math.min(maxB, avail),
      price_per_m2: ppm,
      zoning_status: zoning,
      ada_no: adaNo.trim(),
      parcel_no: parcelNo.trim(),
      owner_name: ownerName.trim(),
      owner_phone: ownerPhone.trim(),
      owner_email: ownerEmail.trim(),
      deed_image_url: deedUrl.trim(),
      submitted_by: sessionEmail,
      manual_coordinates: manualCoords,
    };
    if (manualCoords) {
      payload.latitude = Number(lat);
      payload.longitude = Number(lng);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submit-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));

      if (res.ok && j?.ok) {
        setDone(true);
        return;
      }

      if (res.status === 422 || res.status === 400) {
        throw new Error(j?.error || "Adres doğrulanamadı.");
      }

      if (res.status === 503) {
        throw new Error(
          j?.error ||
            "Sunucu kayıt yapılandırması eksik. Yöneticinizle iletişime geçin veya daha sonra tekrar deneyin."
        );
      }

      throw new Error(j?.error || "Kayıt başarısız");
    } catch (err: any) {
      setError(err?.message || "Beklenmeyen hata");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AppShell>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#FFFFFF",
          color: "#0F172A",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div style={{ ...card, maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.3, marginBottom: 10 }}>
            Başvurun alındı
          </div>
          <p style={{ opacity: 0.85, lineHeight: 1.55, fontSize: 15 }}>
            Arsanız incelemeye alındı. Yönetici onayından sonra haritada yayında görünecektir.
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={{
              marginTop: 22,
              padding: "12px 22px",
              borderRadius: 14,
              border: "1px solid rgba(184,134,11,0.4)",
              background: "linear-gradient(135deg, #e8d48a, #c9a227)",
              color: "#0a0f1a",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Haritaya dön
          </button>
        </div>
      </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        background: "#FFFFFF",
        color: "#0F172A",
        padding: "28px 16px 48px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 22 }}>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={{
              padding: "10px 16px",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.14)",
              background: "#FFFFFF",
              color: "#0F172A",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Geri
          </button>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: 0.2 }}>Arsa İlanı Başvurusu</div>
            <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
              Başvurunuz yönetici onayından sonra yayına alınır. Konum, adresinizden otomatik olarak üretilir.
            </div>
          </div>
        </div>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(220,38,38,0.3)",
              background: "rgba(220,38,38,0.06)",
              color: "#B91C1C",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 14 }}>Temel bilgiler</div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div>
                <div style={labelStyle}>Başlık *</div>
                <input style={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <div style={labelStyle}>Ülke</div>
                <input style={inputBase} value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>Şehir *</div>
                <input style={inputBase} value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>
              <div>
                <div style={labelStyle}>İlçe *</div>
                <input style={inputBase} value={district} onChange={(e) => setDistrict(e.target.value)} required />
              </div>
              <div>
                <div style={labelStyle}>Mahalle</div>
                <input style={inputBase} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Açık adres *</div>
              <textarea
                style={{ ...inputBase, minHeight: 72, resize: "vertical" }}
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Sokak, cadde, kapı numarası / site bilgisi"
                disabled={manualCoords}
              />
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                Bu adres sunucuda konum doğrulaması için kullanılır; yaklaşık konumla kayıt oluşturulmaz.
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Açıklama</div>
              <textarea
                style={{ ...inputBase, minHeight: 100, resize: "vertical" }}
                value={listingDescription}
                onChange={(e) => setListingDescription(e.target.value)}
              />
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, fontSize: 13, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={manualCoords}
                onChange={(e) => setManualCoords(e.target.checked)}
              />
              İleri seviye: koordinatları kendim gireceğim
            </label>
            {manualCoords ? (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <div style={labelStyle}>Enlem</div>
                  <input style={inputBase} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div>
                  <div style={labelStyle}>Boylam</div>
                  <input style={inputBase} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
            ) : null}
          </div>

          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 14 }}>Alan & fiyat</div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div>
                <div style={labelStyle}>Toplam m² *</div>
                <input
                  style={inputBase}
                  inputMode="decimal"
                  value={totalM2}
                  onChange={(e) => setTotalM2(e.target.value)}
                />
              </div>
              <div>
                <div style={labelStyle}>Satılabilir m² *</div>
                <input
                  style={inputBase}
                  inputMode="decimal"
                  value={availableM2}
                  onChange={(e) => setAvailableM2(e.target.value)}
                />
              </div>
              <div>
                <div style={labelStyle}>Min alım m²</div>
                <input style={inputBase} inputMode="decimal" value={minBuy} onChange={(e) => setMinBuy(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>Max alım m²</div>
                <input style={inputBase} inputMode="decimal" value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>m² fiyatı (₺) *</div>
                <input style={inputBase} inputMode="decimal" value={priceM2} onChange={(e) => setPriceM2(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>İmar durumu</div>
                <select style={{ ...inputBase, cursor: "pointer" }} value={zoning} onChange={(e) => setZoning(e.target.value)}>
                  <option value="imarli">İmarlı</option>
                  <option value="imarsiz">İmarsız</option>
                  <option value="bilinmiyor">Bilinmiyor</option>
                </select>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 14 }}>Ada / parsel</div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <div>
                <div style={labelStyle}>Ada no</div>
                <input style={inputBase} value={adaNo} onChange={(e) => setAdaNo(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>Parsel no</div>
                <input style={inputBase} value={parcelNo} onChange={(e) => setParcelNo(e.target.value)} />
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 14 }}>Sahip iletişim</div>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div>
                <div style={labelStyle}>Ad Soyad *</div>
                <input style={inputBase} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>Telefon *</div>
                <input style={inputBase} inputMode="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              </div>
              <div>
                <div style={labelStyle}>E-posta *</div>
                <input style={inputBase} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>Tapu / belge görsel URL (opsiyonel)</div>
                <input style={inputBase} value={deedUrl} onChange={(e) => setDeedUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "14px 22px",
              borderRadius: 16,
              border: "1px solid rgba(184,134,11,0.4)",
              background: submitting ? "rgba(15,23,42,0.06)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
              color: submitting ? "#0F172A" : "#0a0f1a",
              fontWeight: 950,
              fontSize: 16,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.75 : 1,
            }}
          >
            {submitting ? "Gönderiliyor..." : "İncelemeye Gönder"}
          </button>
        </form>
      </div>
    </div>
    </AppShell>
  );
}
