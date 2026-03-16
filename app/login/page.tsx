"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type PropertyRow = {
  id: string;
  owner_id?: string | null;
  title?: string | null;
  city?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  ada_no?: string | null;
  parsel_no?: string | null;
  pafta_no?: string | null;
  acik_adres?: string | null;
  total_area_m2?: number | null;
  available_m2?: number | null;
  sold_m2?: number | null;
  price_per_m2?: number | null;
  zoning_status?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type TabKey = "pending" | "active" | "rejected" | "other";

const ADMIN_EMAILS = ["admin@terron.local", "admin@terron.com"];

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState<TabKey>("pending");
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user ?? null;
        const userEmail = user?.email?.trim().toLowerCase() ?? null;

        console.log("[admin] current user email:", userEmail);

        if (!mounted) return;

        setEmail(userEmail);

        const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
        console.log("[admin] isAdmin:", isAdmin);

        if (!isAdmin) {
          setAuthorized(false);
          setLoading(false);
          router.replace("/dashboard");
          return;
        }

        setAuthorized(true);
        await loadProperties();
        setLoading(false);
      } catch (err: any) {
        console.error("[admin] init error:", err);
        if (!mounted) return;
        setErrorText(err?.message ?? "Admin sayfası yüklenemedi.");
        setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function loadProperties() {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin] properties load error:", error);
      setErrorText(error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as PropertyRow[]);
  }

  async function approveProperty(row: PropertyRow) {
    try {
      setActioningId(row.id);
      setErrorText("");

      const totalArea = Number(row.total_area_m2 ?? 0);

      const { error } = await supabase
        .from("properties")
        .update({
          status: "active",
          available_m2: totalArea,
          sold_m2: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) {
        console.error("[admin] approve error:", error);
        alert(error.message);
        return;
      }

      await loadProperties();
    } catch (err: any) {
      console.error("[admin] approve exception:", err);
      alert(err?.message ?? "Onaylama sırasında hata oluştu.");
    } finally {
      setActioningId(null);
    }
  }

  async function rejectProperty(row: PropertyRow) {
    try {
      setActioningId(row.id);
      setErrorText("");

      const { error } = await supabase
        .from("properties")
        .update({
          status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) {
        console.error("[admin] reject error:", error);
        alert(error.message);
        return;
      }

      await loadProperties();
    } catch (err: any) {
      console.error("[admin] reject exception:", err);
      alert(err?.message ?? "Reddetme sırasında hata oluştu.");
    } finally {
      setActioningId(null);
    }
  }

  const counts = useMemo(() => {
    const pending = rows.filter((x) => (x.status ?? "").toLowerCase() === "pending").length;
    const active = rows.filter((x) => (x.status ?? "").toLowerCase() === "active").length;
    const rejected = rows.filter((x) => (x.status ?? "").toLowerCase() === "rejected").length;
    const other = rows.filter((x) => {
      const s = (x.status ?? "").toLowerCase();
      return s !== "pending" && s !== "active" && s !== "rejected";
    }).length;

    return {
      total: rows.length,
      pending,
      active,
      rejected,
      other,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((x) => {
      const s = (x.status ?? "").toLowerCase();

      if (tab === "pending") return s === "pending";
      if (tab === "active") return s === "active";
      if (tab === "rejected") return s === "rejected";
      return s !== "pending" && s !== "active" && s !== "rejected";
    });
  }, [rows, tab]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerCard}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Admin Panel</div>
            <div style={{ opacity: 0.72, marginTop: 8 }}>Yükleniyor...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerCard}>
          <div style={topBar}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 1000, letterSpacing: 0.3 }}>Admin Panel</div>
              <div style={{ opacity: 0.72, marginTop: 8 }}>
                Bekleyen ilanlar, aktif ilanlar ve platform yönetimi
              </div>
              <div style={{ opacity: 0.5, marginTop: 8, fontSize: 12 }}>{email}</div>
            </div>

            <div style={actionsRow}>
              <button style={ghostBtn} onClick={() => router.push("/dashboard")}>
                Dashboard
              </button>
              <button style={ghostBtn} onClick={loadProperties}>
                Yenile
              </button>
            </div>
          </div>

          <div style={statsGrid}>
            <StatCard label="Bekleyen İlan" value={counts.pending} />
            <StatCard label="Aktif İlan" value={counts.active} />
            <StatCard label="Reddedilen" value={counts.rejected} />
            <StatCard label="Toplam Properties" value={counts.total} />
          </div>
        </div>

        {errorText ? (
          <div style={errorBox}>
            <div style={{ fontWeight: 900 }}>Hata</div>
            <div style={{ marginTop: 6, opacity: 0.85 }}>{errorText}</div>
          </div>
        ) : null}

        <div style={tabsRow}>
          <button style={tabBtn(tab === "pending")} onClick={() => setTab("pending")}>
            Bekleyen ({counts.pending})
          </button>
          <button style={tabBtn(tab === "active")} onClick={() => setTab("active")}>
            Aktif ({counts.active})
          </button>
          <button style={tabBtn(tab === "rejected")} onClick={() => setTab("rejected")}>
            Reddedilen ({counts.rejected})
          </button>
          <button style={tabBtn(tab === "other")} onClick={() => setTab("other")}>
            Diğer ({counts.other})
          </button>
        </div>

        {filteredRows.length === 0 ? (
          <div style={emptyCard}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Bu sekmede kayıt yok</div>
            <div style={{ marginTop: 8, opacity: 0.7 }}>
              {tab === "pending"
                ? "Onay bekleyen ilan bulunmuyor."
                : tab === "active"
                ? "Aktif ilan bulunmuyor."
                : tab === "rejected"
                ? "Reddedilen ilan bulunmuyor."
                : "Status alanı farklı olan kayıt bulunmuyor."}
            </div>
          </div>
        ) : (
          <div style={cardsGrid}>
            {filteredRows.map((row) => {
              const isBusy = actioningId === row.id;
              const statusText = row.status ?? "null";

              return (
                <div key={row.id} style={cardStyle}>
                  <div style={cardTop}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 1000 }}>
                        {row.title || "Başlıksız ilan"}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.72, marginTop: 6 }}>
                        {row.city || "—"}
                        {row.district ? ` / ${row.district}` : ""}
                        {row.neighborhood ? ` / ${row.neighborhood}` : ""}
                      </div>
                    </div>

                    <div style={statusBadge(String(statusText))}>{statusText}</div>
                  </div>

                  <div style={infoGrid}>
                    <InfoItem label="Ada No" value={row.ada_no} />
                    <InfoItem label="Parsel No" value={row.parsel_no} />
                    <InfoItem label="Pafta No" value={row.pafta_no} />
                    <InfoItem label="Toplam m²" value={formatNum(row.total_area_m2)} />
                    <InfoItem label="Kalan m²" value={formatNum(row.available_m2)} />
                    <InfoItem label="Satılan m²" value={formatNum(row.sold_m2)} />
                    <InfoItem label="m² Fiyatı" value={formatPrice(row.price_per_m2)} />
                    <InfoItem label="İmar" value={row.zoning_status} />
                  </div>

                  <div style={sectionBox}>
                    <div style={sectionLabel}>Açık Adres</div>
                    <div style={sectionText}>{row.acik_adres || "—"}</div>
                  </div>

                  <div style={sectionBox}>
                    <div style={sectionLabel}>Açıklama</div>
                    <div style={sectionText}>{row.description || "—"}</div>
                  </div>

                  <div style={ownerText}>owner_id: {row.owner_id || "—"}</div>

                  <div style={buttonRow}>
                    <button
                      style={{
                        ...approveBtn,
                        opacity: isBusy ? 0.6 : 1,
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                      disabled={isBusy}
                      onClick={() => approveProperty(row)}
                    >
                      {isBusy ? "İşleniyor..." : "Onayla"}
                    </button>

                    <button
                      style={{
                        ...rejectBtn,
                        opacity: isBusy ? 0.6 : 1,
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                      disabled={isBusy}
                      onClick={() => rejectProperty(row)}
                    >
                      {isBusy ? "İşleniyor..." : "Reddet"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 1000, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div style={miniCard}>
      <div style={{ fontSize: 11, opacity: 0.65 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6 }}>{value || "—"}</div>
    </div>
  );
}

function formatNum(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("tr-TR").format(Number(n));
}

function formatPrice(n?: number | null) {
  if (n == null) return "—";
  return `₺${new Intl.NumberFormat("tr-TR").format(Number(n))}`;
}

function statusBadge(status: string): React.CSSProperties {
  const s = status.toLowerCase();

  if (s === "pending") {
    return {
      ...badgeBase,
      color: "#f5d76e",
      background: "rgba(245,215,110,0.12)",
      border: "1px solid rgba(245,215,110,0.25)",
    };
  }

  if (s === "active") {
    return {
      ...badgeBase,
      color: "#7ef7b1",
      background: "rgba(126,247,177,0.12)",
      border: "1px solid rgba(126,247,177,0.25)",
    };
  }

  if (s === "rejected") {
    return {
      ...badgeBase,
      color: "#ff8a8a",
      background: "rgba(255,138,138,0.12)",
      border: "1px solid rgba(255,138,138,0.25)",
    };
  }

  return {
    ...badgeBase,
    color: "#d8deea",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
  };
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "12px 16px",
    borderRadius: 14,
    border: active ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.1)",
    background: active ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  };
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #050B18 0%, #071224 100%)",
  color: "white",
  padding: "28px 18px 60px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1400,
  margin: "0 auto",
};

const headerCard: React.CSSProperties = {
  padding: 22,
  borderRadius: 24,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
};

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const actionsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const ghostBtn: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const statsGrid: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 20,
  marginBottom: 18,
};

const cardsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 22,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
};

const cardTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const badgeBase: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginTop: 16,
};

const miniCard: React.CSSProperties = {
  padding: 12,
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sectionBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  marginBottom: 8,
};

const sectionText: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  opacity: 0.92,
  wordBreak: "break-word",
};

const ownerText: React.CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  opacity: 0.55,
  wordBreak: "break-all",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 16,
};

const approveBtn: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(36,190,120,0.16)",
  border: "1px solid rgba(36,190,120,0.3)",
  color: "#7ef7b1",
  fontWeight: 900,
};

const rejectBtn: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(239,68,68,0.14)",
  border: "1px solid rgba(239,68,68,0.28)",
  color: "#ff8a8a",
  fontWeight: 900,
};

const emptyCard: React.CSSProperties = {
  padding: 28,
  borderRadius: 22,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  textAlign: "center",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 12,
  padding: 16,
  borderRadius: 16,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.24)",
  color: "#ffd0d0",
};