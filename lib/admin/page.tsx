"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { isAdminEmail } from "../../lib/admin/isAdmin";

type RevenueRow = {
  id: string;
  user_id: string | null;
  property_id: string | null;
  type: "buy_fee" | "sell_fee";
  gross_amount: number | null;
  fee_rate: number | null;
  fee_amount: number | null;
  created_at: string;
};

type WalletRow = {
  user_id: string;
  balance: number | null;
};

type PropertyRow = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  price_per_m2: number | null;
  total_area_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
  ada_no?: string | null;
  parcel_no?: string | null;
  address?: string | null;
};

type PositionRow = {
  id: string;
  user_id: string;
  property_id: string;
  m2: number | null;
  total_paid: number | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email?: string | null;
};

export default function AdminPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [revenues, setRevenues] = useState<RevenueRow[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      const userEmail = user?.email ?? null;

      setEmail(userEmail);

      if (!isAdminEmail(userEmail)) {
        router.replace("/dashboard");
        return;
      }

      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const userEmail = user?.email ?? null;
      setEmail(userEmail);

      if (!isAdminEmail(userEmail)) {
        router.replace("/dashboard");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (checking) return;
    if (!isAdminEmail(email)) return;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const [revRes, walletRes, propRes, posRes, profileRes] = await Promise.all([
          supabase
            .from("platform_revenue")
            .select("id,user_id,property_id,type,gross_amount,fee_rate,fee_amount,created_at")
            .order("created_at", { ascending: false }),
          supabase.from("wallets").select("user_id,balance"),
          supabase
            .from("properties")
            .select(
              "id,title,city,district,neighborhood,price_per_m2,total_area_m2,available_m2,sold_m2,address,ada_no,parcel_no"
            )
            .order("city", { ascending: true }),
          supabase
            .from("positions")
            .select("id,user_id,property_id,m2,total_paid,created_at")
            .order("created_at", { ascending: false }),
          supabase.from("profiles").select("id,email"),
        ]);

        if (revRes.error) throw revRes.error;
        if (walletRes.error) throw walletRes.error;
        if (propRes.error) throw propRes.error;
        if (posRes.error) throw posRes.error;
        if (profileRes.error) throw profileRes.error;

        setRevenues((revRes.data as RevenueRow[]) ?? []);
        setWallets((walletRes.data as WalletRow[]) ?? []);
        setProperties((propRes.data as PropertyRow[]) ?? []);
        setPositions((posRes.data as PositionRow[]) ?? []);
        setProfiles((profileRes.data as ProfileRow[]) ?? []);
      } catch (err: any) {
        console.error("[admin] load error:", err);
        setErrorMsg(err?.message ?? "Admin verileri yüklenemedi.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [checking, email]);

  const summary = useMemo(() => {
    const totalUsers = profiles.length || wallets.length;

    const activePositions = positions.filter((p) => Number(p.m2 ?? 0) > 0);
    const investorSet = new Set(activePositions.map((p) => p.user_id).filter(Boolean));

    const totalPropertyCount = properties.length;

    const totalPropertyM2 = properties.reduce((acc, p) => acc + Number(p.total_area_m2 ?? 0), 0);

    const totalPropertyValue = properties.reduce((acc, p) => {
      const totalArea = Number(p.total_area_m2 ?? 0);
      const price = Number(p.price_per_m2 ?? 0);
      return acc + totalArea * price;
    }, 0);

    const soldM2 = properties.reduce((acc, p) => acc + Number(p.sold_m2 ?? 0), 0);

    const soldValue = properties.reduce((acc, p) => {
      const m2 = Number(p.sold_m2 ?? 0);
      const price = Number(p.price_per_m2 ?? 0);
      return acc + m2 * price;
    }, 0);

    const availableM2 = properties.reduce((acc, p) => acc + Number(p.available_m2 ?? 0), 0);

    const activeHeldM2 = activePositions.reduce((acc, p) => acc + Number(p.m2 ?? 0), 0);

    const activePositionCount = activePositions.length;

    const totalWalletBalance = wallets.reduce((acc, w) => acc + Number(w.balance ?? 0), 0);

    const buyFeeTotal = revenues
      .filter((r) => r.type === "buy_fee")
      .reduce((acc, r) => acc + Number(r.fee_amount ?? 0), 0);

    const sellFeeTotal = revenues
      .filter((r) => r.type === "sell_fee")
      .reduce((acc, r) => acc + Number(r.fee_amount ?? 0), 0);

    const totalPlatformRevenue = buyFeeTotal + sellFeeTotal;

    const totalVolume = revenues.reduce((acc, r) => acc + Number(r.gross_amount ?? 0), 0);

    const adminWallet =
      wallets.find((w) => String(w.user_id || "") === "admin")?.balance ?? null;

    return {
      totalUsers,
      totalPropertyCount,
      totalPropertyM2,
      totalPropertyValue,
      soldM2,
      soldValue,
      availableM2,
      activeHeldM2,
      activePositionCount,
      investorCount: investorSet.size,
      totalWalletBalance,
      buyFeeTotal,
      sellFeeTotal,
      totalPlatformRevenue,
      totalVolume,
      adminWallet,
    };
  }, [profiles, wallets, properties, positions, revenues]);

  const recentRevenue = useMemo(() => revenues.slice(0, 12), [revenues]);
  const topProperties = useMemo(() => properties.slice(0, 20), [properties]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checking) {
    return <div style={{ padding: 24, color: "white", background: "#0b1220", minHeight: "100vh" }}>Yetki kontrol ediliyor...</div>;
  }

  if (!isAdminEmail(email)) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <div style={topbar}>
        <button onClick={() => router.push("/dashboard")} style={btnGhost}>
          ← Dashboard
        </button>

        <div style={{ fontWeight: 900, letterSpacing: 0.3 }}>Terron Admin Panel</div>

        <div style={{ flex: 1 }} />

        <div style={pill}>Admin: {email}</div>

        <button onClick={logout} style={btnDanger}>
          Çıkış
        </button>
      </div>

      <div style={{ maxWidth: 1480, margin: "0 auto", padding: 16 }}>
        {errorMsg && (
          <div
            style={{
              ...card,
              padding: 14,
              marginBottom: 12,
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.10)",
            }}
          >
            <div style={{ fontWeight: 900 }}>Hata</div>
            <div style={{ marginTop: 6, opacity: 0.88 }}>{errorMsg}</div>
          </div>
        )}

        <div style={statsGrid}>
          <StatCard title="Toplam Kullanıcı" value={formatNumber(summary.totalUsers)} sub="Profiles / wallets verisinden" />
          <StatCard title="Toplam Yatırımcı" value={formatNumber(summary.investorCount)} sub="Aktif pozisyon sahibi kullanıcı" />
          <StatCard title="Toplam Arsa" value={formatNumber(summary.totalPropertyCount)} sub="Sistemde kayıtlı arsa adedi" />
          <StatCard title="Toplam Arsa m²" value={formatNumber(summary.totalPropertyM2)} sub="Sistemdeki toplam alan" />
          <StatCard title="Toplam Arsa Değeri" value={`${formatNumber(summary.totalPropertyValue)} Çip`} sub="price_per_m2 × total_area_m2" />
          <StatCard title="Satılan Arsa m²" value={formatNumber(summary.soldM2)} sub="Properties.sold_m2 toplamı" />
          <StatCard title="Satılan Arsa Değeri" value={`${formatNumber(summary.soldValue)} Çip`} sub="sold_m2 × price_per_m2" />
          <StatCard title="Aktif Tutulan m²" value={formatNumber(summary.activeHeldM2)} sub="Pozisyonlarda duran toplam m²" />
          <StatCard title="Aktif Pozisyon" value={formatNumber(summary.activePositionCount)} sub="m² > 0 pozisyon" />
          <StatCard title="Toplam İşlem Hacmi" value={`${formatNumber(summary.totalVolume)} Çip`} sub="Buy + sell gross amount" />
          <StatCard title="Alış Komisyon" value={`${formatNumber(summary.buyFeeTotal)} Çip`} sub="%0.5 gelir toplamı" />
          <StatCard title="Satış Komisyon" value={`${formatNumber(summary.sellFeeTotal)} Çip`} sub="%1 gelir toplamı" />
          <StatCard title="Terron Kasa Kârı" value={`${formatNumber(summary.totalPlatformRevenue)} Çip`} sub="Toplam platform revenue" />
          <StatCard title="Toplam Wallet Bakiyesi" value={`${formatNumber(summary.totalWalletBalance)} Çip`} sub="Tüm kullanıcı bakiyeleri" />
        </div>

        <div style={{ height: 14 }} />

        <div style={sectionGrid}>
          <div style={card}>
            <div style={sectionHeader}>Son Komisyon Kayıtları</div>

            {loading ? (
              <div style={{ padding: 14 }}>Yükleniyor…</div>
            ) : recentRevenue.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.75 }}>Henüz revenue kaydı yok.</div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={th}>Tarih</th>
                      <th style={th}>Tip</th>
                      <th style={th}>Kullanıcı</th>
                      <th style={th}>Arsa</th>
                      <th style={th}>Brüt</th>
                      <th style={th}>Oran</th>
                      <th style={th}>Komisyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRevenue.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={td}>{new Date(r.created_at).toLocaleString("tr-TR")}</td>
                        <td style={td}>{r.type === "buy_fee" ? "Alış" : "Satış"}</td>
                        <td style={td}>{r.user_id ?? "-"}</td>
                        <td style={td}>{r.property_id ?? "-"}</td>
                        <td style={td}>{formatNumber(Number(r.gross_amount ?? 0))} Çip</td>
                        <td style={td}>%{(Number(r.fee_rate ?? 0) * 100).toFixed(2)}</td>
                        <td style={td}>{formatNumber(Number(r.fee_amount ?? 0))} Çip</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={card}>
            <div style={sectionHeader}>Arsa Özeti</div>

            {loading ? (
              <div style={{ padding: 14 }}>Yükleniyor…</div>
            ) : topProperties.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.75 }}>Arsa bulunamadı.</div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                  <thead>
                    <tr>
                      <th style={th}>Arsa</th>
                      <th style={th}>Bölge</th>
                      <th style={th}>Adres</th>
                      <th style={th}>Ada / Parsel</th>
                      <th style={th}>Toplam m²</th>
                      <th style={th}>Satılan m²</th>
                      <th style={th}>Müsait m²</th>
                      <th style={th}>₺/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProperties.map((p) => (
                      <tr key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={td}>{p.title}</td>
                        <td style={td}>
                          {p.city}
                          {p.district ? ` / ${p.district}` : ""}
                          {p.neighborhood ? ` / ${p.neighborhood}` : ""}
                        </td>
                        <td style={td}>{p.address || "-"}</td>
                        <td style={td}>
                          {[p.ada_no || "-", p.parcel_no || "-"].join(" / ")}
                        </td>
                        <td style={td}>{formatNumber(Number(p.total_area_m2 ?? 0))}</td>
                        <td style={td}>{formatNumber(Number(p.sold_m2 ?? 0))}</td>
                        <td style={td}>{formatNumber(Number(p.available_m2 ?? 0))}</td>
                        <td style={td}>₺{formatNumber(Number(p.price_per_m2 ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{title}</div>
      <div style={statValue}>{value}</div>
      <div style={statSub}>{sub || ""}</div>
    </div>
  );
}

function formatNumber(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", {
      maximumFractionDigits: 0,
    }).format(x);
  } catch {
    return String(Math.round(x));
  }
}

const topbar: React.CSSProperties = {
  minHeight: 60,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.22)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  backdropFilter: "blur(10px)",
  flexWrap: "wrap",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.05fr 1.2fr",
  gap: 14,
};

const card: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  overflow: "hidden",
};

const statCard: React.CSSProperties = {
  borderRadius: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.045))",
  border: "1px solid rgba(255,255,255,0.10)",
  padding: 16,
};

const statLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  marginBottom: 8,
};

const statValue: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 950,
  letterSpacing: 0.2,
};

const statSub: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.58,
  marginTop: 8,
  lineHeight: 1.45,
};

const sectionHeader: React.CSSProperties = {
  padding: 14,
  fontWeight: 900,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const pill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "white",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.14)",
  border: "1px solid rgba(239,68,68,0.26)",
  color: "white",
  cursor: "pointer",
};