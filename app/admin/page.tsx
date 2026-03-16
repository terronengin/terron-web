"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type PendingProperty = {
  id: string;
  title: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  ada_no: string | null;
  parsel_no: string | null;
  total_area_m2: number | null;
  price_per_m2: number | null;
  status: string | null;
  available_m2?: number | null;
  sold_m2?: number | null;
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
};

function fmtNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("tr-TR").format(value);
}

export default function AdminPage() {
  const [properties, setProperties] = useState<PendingProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [infoText, setInfoText] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadPending() {
    try {
      setLoading(true);
      setErrorText("");
      setInfoText("");

      let query = supabase
        .from("properties")
        .select(
          "id, title, city, district, neighborhood, ada_no, parsel_no, total_area_m2, price_per_m2, status, available_m2, sold_m2, created_at, latitude, longitude"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      // Eğer source kolonu eklediysen ve sadece kullanıcı ilanlarını görmek istiyorsan
      // aşağıdaki satırı aç:
      // query = query.eq("source", "user");

      const { data, error } = await query;

      if (error) throw error;

      setProperties((data ?? []) as PendingProperty[]);
    } catch (err: any) {
      console.error("[admin] pending load error:", err);
      setErrorText(err?.message || "Bekleyen ilanlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleApprove(property: PendingProperty) {
    try {
      setUpdatingId(property.id);
      setErrorText("");
      setInfoText("");

      const totalArea = Number(property.total_area_m2 || 0);

      const { error } = await supabase
        .from("properties")
        .update({
          status: "active",
          available_m2: totalArea,
          sold_m2: 0,
        })
        .eq("id", property.id);

      if (error) throw error;

      setInfoText(`"${property.title || "İlan"}" onaylandı.`);
      await loadPending();
    } catch (err: any) {
      console.error("[admin] approve error:", err);
      setErrorText(err?.message || "İlan onaylanamadı.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleReject(property: PendingProperty) {
    try {
      setUpdatingId(property.id);
      setErrorText("");
      setInfoText("");

      const { error } = await supabase
        .from("properties")
        .update({
          status: "rejected",
        })
        .eq("id", property.id);

      if (error) throw error;

      setInfoText(`"${property.title || "İlan"}" reddedildi.`);
      await loadPending();
    } catch (err: any) {
      console.error("[admin] reject error:", err);
      setErrorText(err?.message || "İlan reddedilemedi.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #031326 0%, #071a33 100%)",
        color: "white",
        padding: 32,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, marginBottom: 10 }}>
          Admin Panel
        </h1>
        <p style={{ opacity: 0.78, marginBottom: 24 }}>
          Bekleyen ilanları inceleyip onaylayabilir veya reddedebilirsin.
        </p>

        {errorText ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,90,90,0.35)",
              background: "rgba(120,20,20,0.25)",
              color: "#ffb3b3",
            }}
          >
            {errorText}
          </div>
        ) : null}

        {infoText ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(80,220,140,0.35)",
              background: "rgba(20,90,50,0.22)",
              color: "#b9ffd1",
            }}
          >
            {infoText}
          </div>
        ) : null}

        <div
          style={{
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(10,22,44,0.78)",
            padding: 18,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              marginBottom: 16,
            }}
          >
            Bekleyen İlanlar ({loading ? "..." : properties.length})
          </div>

          {loading ? (
            <div style={{ opacity: 0.75, padding: 18 }}>Yükleniyor...</div>
          ) : properties.length === 0 ? (
            <div
              style={{
                opacity: 0.75,
                padding: 18,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              Bekleyen ilan yok.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              {properties.map((property) => {
                const isBusy = updatingId === property.id;

                return (
                  <div
                    key={property.id}
                    style={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.07)",
                      background: "#04142b",
                      padding: 20,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            marginBottom: 6,
                          }}
                        >
                          {property.title || "Başlıksız ilan"}
                        </div>

                        <div style={{ opacity: 0.82, marginBottom: 6 }}>
                          {property.city || "-"} / {property.district || "-"} /{" "}
                          {property.neighborhood || "-"}
                        </div>

                        <div style={{ opacity: 0.72, marginBottom: 4 }}>
                          Ada / Parsel: {property.ada_no || "-"} /{" "}
                          {property.parsel_no || "-"}
                        </div>

                        <div style={{ opacity: 0.72, marginBottom: 4 }}>
                          Toplam Alan: {fmtNumber(property.total_area_m2)} m²
                        </div>

                        <div style={{ opacity: 0.72, marginBottom: 4 }}>
                          m² Fiyat: {fmtNumber(property.price_per_m2)} ₺
                        </div>

                        <div style={{ opacity: 0.72, marginBottom: 4 }}>
                          Durum: {property.status || "-"}
                        </div>

                        <div style={{ opacity: 0.55, fontSize: 13 }}>
                          Koordinat:{" "}
                          {property.latitude != null && property.longitude != null
                            ? `${property.latitude}, ${property.longitude}`
                            : "yok"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <button
                          onClick={() => handleApprove(property)}
                          disabled={isBusy}
                          style={{
                            border: "none",
                            borderRadius: 12,
                            padding: "12px 18px",
                            background: isBusy ? "#3aa86a" : "#39d98a",
                            color: "#062112",
                            fontWeight: 800,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          {isBusy ? "İşleniyor..." : "Onayla"}
                        </button>

                        <button
                          onClick={() => handleReject(property)}
                          disabled={isBusy}
                          style={{
                            border: "1px solid rgba(255,255,255,0.14)",
                            borderRadius: 12,
                            padding: "12px 18px",
                            background: "transparent",
                            color: "#ff8b8b",
                            fontWeight: 800,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          Reddet
                        </button>
                      </div>
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