"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { supabase } from "@/lib/supabaseClient";
import { ensureAndLoadWallet, formatTRY } from "@/lib/wallet";
import { AppShell } from "../components/AppShell";

type ProfileInfo = {
  email: string;
  displayName: string;
  avatarUrl: string;
  city: string;
  district: string;
  createdAt: string | null;
  emailConfirmed: boolean;
};

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.09)",
  padding: 16,
};

const rowLabel: React.CSSProperties = { fontSize: 11, opacity: 0.6, fontWeight: 700, letterSpacing: 0.2 };
const rowValue: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginTop: 3 };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={rowLabel}>{label}</div>
      <div style={rowValue}>{value || "—"}</div>
    </div>
  );
}

function NavRow({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 4px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        color: danger ? "#fca5a5" : "white",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: 0.4 }}>›</span>
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) {
        setInfo(null);
        return;
      }
      setInfo({
        email: u.email ?? "",
        displayName:
          (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || (u.email?.split("@")[0] ?? ""),
        avatarUrl: (u.user_metadata?.avatar_url as string) || (u.user_metadata?.picture as string) || "",
        city: (u.user_metadata?.city as string) || "",
        district: (u.user_metadata?.district as string) || "",
        createdAt: u.created_at ?? null,
        emailConfirmed: !!u.email_confirmed_at,
      });
    });
    ensureAndLoadWallet().then(setWalletBalance);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function notYetAvailable(action: string) {
    alert(`${action} özelliği yakında aktif olacak.`);
  }

  const memberSince = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <AppShell>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#070B14", color: "white" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 14px 40px" }}>
          <h1 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 800 }}>Profil</h1>

          {!info ? (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.8 }}>Bilgilerinizi görmek için giriş yapın.</p>
              <button
                onClick={() => router.push("/login")}
                style={{
                  padding: "10px 20px",
                  borderRadius: 12,
                  border: "1px solid rgba(245,215,110,0.4)",
                  background: "linear-gradient(135deg, #e8d48a, #c9a227)",
                  color: "#0a0f1a",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Giriş Yap
              </button>
            </div>
          ) : (
            <>
              <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {info.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={info.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 22, fontWeight: 800, opacity: 0.85 }}>
                      {(info.displayName?.[0] ?? "A").toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{info.displayName || "Kullanıcı"}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>{info.email}</div>
                </div>
              </div>

              {/* Cüzdan */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={rowLabel}>CÜZDAN BAKİYESİ</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: "#F5D76E" }}>
                  {walletBalance != null ? `₺${formatTRY(walletBalance)}` : "—"}
                </div>
                <p style={{ margin: "8px 0 14px", fontSize: 11.5, opacity: 0.55, lineHeight: 1.5 }}>
                  Bu bakiye platform içi simülasyon amaçlıdır; gerçek banka hesabınızdan para çekme/yatırma işlemi
                  yapılmaz.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => notYetAvailable("Para yatırma")}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Para Yatır
                  </button>
                  <button
                    onClick={() => notYetAvailable("Para çekme")}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Para Çek
                  </button>
                </div>
              </div>

              {/* Kişisel bilgiler */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, opacity: 0.85 }}>Kişisel Bilgiler</div>
                <InfoRow label="AD SOYAD" value={info.displayName} />
                <InfoRow label="E-POSTA" value={info.email} />
                <InfoRow label="ŞEHİR" value={info.city} />
                <InfoRow label="İLÇE" value={info.district} />
              </div>

              {/* Hesap bilgileri */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, opacity: 0.85 }}>Hesap Bilgileri</div>
                <InfoRow label="ÜYELİK TARİHİ" value={memberSince} />
                <InfoRow label="E-POSTA DOĞRULAMA" value={info.emailConfirmed ? "Doğrulanmış" : "Doğrulanmamış"} />
              </div>

              {/* Diğer işlemler */}
              <div style={card}>
                <NavRow label="Talep Süreci" onClick={() => router.push("/inquiries")} />
                <NavRow label="İlan Ver" onClick={() => router.push("/submit-property")} />
                {isAdminEmail(info.email) ? <NavRow label="Admin Paneli" onClick={() => router.push("/admin")} /> : null}
                <div style={{ marginTop: 6 }}>
                  <NavRow label="Çıkış Yap" onClick={logout} danger />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
