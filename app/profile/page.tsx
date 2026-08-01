"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { supabase } from "@/lib/supabaseClient";
import { formatTRY } from "@/lib/wallet";
import { calculateSellQuoteTRY } from "@/lib/sim/realEstatePrice";
import { getTerronSalePricePerM2, type TerronPropertyPricingInput } from "@/lib/propertySalePrice";
import { AppShell } from "../components/AppShell";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LOCALES } from "@/lib/i18n/locales";

type ProfileInfo = {
  email: string;
  displayName: string;
  avatarUrl: string;
  city: string;
  district: string;
  createdAt: string | null;
  emailConfirmed: boolean;
};

type PositionRow = { property_id: string; m2: number | null; total_paid: number | null };
type PropertyLite = {
  id: string;
  price_per_m2: number | null;
  total_area_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
  development_score: number | null;
  last_30d_change: number | null;
  quality_score: number | null;
  risk_score: number | null;
  rental_yield_annual: number | null;
  min_buy_m2: number | null;
  total_shares: number | null;
};

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 8px 24px rgba(255,255,255,0.06)",
  padding: 16,
};

const rowLabel: React.CSSProperties = { fontSize: 11, opacity: 0.5, fontWeight: 700, letterSpacing: 0.2 };
const rowValue: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginTop: 3 };

const fieldInput: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 12,
  background: "rgba(12,20,38,0.92)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  fontSize: 13,
  outline: "none",
  marginBottom: 8,
  boxSizing: "border-box",
};

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
      <span style={{ opacity: 0.35 }}>›</span>
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [bankName, setBankName] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [propById, setPropById] = useState<Record<string, PropertyLite>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) {
        setInfo(null);
        return;
      }
      setUserId(u.id);
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
      const meta = u.user_metadata as Record<string, string> | undefined;
      setBankName(meta?.bank_name ?? "");
      setBankHolder(meta?.bank_account_holder ?? "");
      setBankIban(meta?.bank_iban ?? "");

      supabase
        .from("positions")
        .select("property_id,m2,total_paid")
        .eq("user_id", u.id)
        .then(({ data: posData }) => {
          const rows = (posData ?? []) as PositionRow[];
          setPositions(rows);
          const ids = [...new Set(rows.map((r) => r.property_id).filter(Boolean))];
          if (ids.length === 0) return;
          supabase
            .from("properties")
            .select(
              "id,price_per_m2,total_area_m2,available_m2,sold_m2,development_score,last_30d_change,quality_score,risk_score,rental_yield_annual,min_buy_m2,total_shares"
            )
            .in("id", ids)
            .then(({ data: propData }) => {
              const map: Record<string, PropertyLite> = {};
              for (const p of (propData ?? []) as PropertyLite[]) map[p.id] = p;
              setPropById(map);
            });
        });
    });
  }, []);

  const investmentTotals = useMemo(() => {
    const scope = userId ?? "global";
    let invested = 0;
    let currentValue = 0;
    for (const r of positions) {
      const paid = Number(r.total_paid ?? 0);
      invested += paid;
      const prop = propById[r.property_id];
      const m2 = Number(r.m2 ?? 0);
      if (prop && m2 > 0) {
        const salePx = getTerronSalePricePerM2(prop as TerronPropertyPricingInput, scope);
        if (salePx > 0) {
          const q = calculateSellQuoteTRY(salePx, m2);
          currentValue += Math.round(q.grossSaleValue);
          continue;
        }
      }
      currentValue += paid;
    }
    return { invested, currentValue, profit: currentValue - invested };
  }, [positions, propById, userId]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function changePassword() {
    setPwMsg(null);
    if (newPassword.length < 6) {
      setPwMsg({ text: t("profile.msg.passwordTooShort"), error: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ text: t("profile.msg.passwordMismatch"), error: true });
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwMsg({ text: error.message, error: true });
        return;
      }
      setPwMsg({ text: t("profile.msg.passwordUpdated") });
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setPwSaving(false);
    }
  }

  async function saveBankInfo() {
    setBankMsg(null);
    if (!bankName.trim() || !bankHolder.trim() || !bankIban.trim()) {
      setBankMsg({ text: t("profile.msg.bankInfoRequired"), error: true });
      return;
    }
    setBankSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          bank_name: bankName.trim(),
          bank_account_holder: bankHolder.trim(),
          bank_iban: bankIban.trim().toUpperCase(),
        },
      });
      if (error) {
        setBankMsg({ text: error.message, error: true });
        return;
      }
      setBankMsg({ text: "Banka bilgileri kaydedildi." });
    } finally {
      setBankSaving(false);
    }
  }

  const memberSince = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <AppShell>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "rgba(12,20,38,0.92)", color: "white" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 14px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{t("profile.title")}</h1>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number]["code"])}
              style={{
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "white",
                fontSize: 12.5,
                fontWeight: 700,
              }}
              title={t("profile.language")}
            >
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code} style={{ color: "#0F172A" }}>
                  {l.nativeLabel}
                </option>
              ))}
            </select>
          </div>

          {!info ? (
            <div style={{ ...card, textAlign: "center", padding: 30 }}>
              <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.8 }}>{t("profile.loginPrompt")}</p>
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
                {t("profile.loginButton")}
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
                    background: "rgba(255,255,255,0.04)",
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
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{info.displayName || t("profile.defaultUser")}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.6, marginTop: 2 }}>{info.email}</div>
                </div>
              </div>

              {/* Yatırım özeti */}
              <div style={{ ...card, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={rowLabel}>TOPLAM YATIRIM</div>
                  <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>₺{formatTRY(investmentTotals.invested)}</div>
                </div>
                <div>
                  <div style={rowLabel}>ŞUANKİ TOPLAM KÂR</div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      marginTop: 4,
                      color: investmentTotals.profit >= 0 ? "#86efac" : "#fca5a5",
                    }}
                  >
                    {investmentTotals.profit >= 0 ? "+" : ""}
                    ₺{formatTRY(investmentTotals.profit)}
                  </div>
                </div>
              </div>

              {/* Kişisel bilgiler */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, opacity: 0.85 }}>{t("profile.personalInfo")}</div>
                <InfoRow label={t("profile.fullName")} value={info.displayName} />
                <InfoRow label={t("profile.email")} value={info.email} />
                <InfoRow label={t("profile.city")} value={info.city} />
                <InfoRow label={t("profile.district")} value={info.district} />
                <InfoRow label={t("profile.memberSince")} value={memberSince} />
                <InfoRow label={t("profile.emailVerification")} value={info.emailConfirmed ? t("profile.verified") : t("profile.notVerified")} />
              </div>

              {/* Banka bilgileri */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, opacity: 0.85 }}>Banka Bilgileri</div>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder={t("profile.bankNamePlaceholder")}
                  style={fieldInput}
                />
                <input
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  placeholder={t("profile.accountHolderPlaceholder")}
                  style={fieldInput}
                />
                <input
                  value={bankIban}
                  onChange={(e) => setBankIban(e.target.value.toUpperCase())}
                  placeholder={t("profile.ibanPlaceholder")}
                  style={fieldInput}
                />
                {bankMsg ? (
                  <div style={{ fontSize: 12, marginBottom: 8, color: bankMsg.error ? "#fca5a5" : "#86efac", fontWeight: 700 }}>
                    {bankMsg.text}
                  </div>
                ) : null}
                <button
                  onClick={() => void saveBankInfo()}
                  disabled={bankSaving}
                  style={{
                    width: "100%",
                    padding: "11px 0",
                    borderRadius: 12,
                    border: "1px solid rgba(245,215,110,0.4)",
                    background: bankSaving ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                    color: bankSaving ? "white" : "#0a0f1a",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: bankSaving ? "not-allowed" : "pointer",
                    opacity: bankSaving ? 0.6 : 1,
                  }}
                >
                  {bankSaving ? t("profile.updating") : "Kaydet"}
                </button>
                <p style={{ margin: "10px 0 0", fontSize: 10.5, opacity: 0.45, lineHeight: 1.5 }}>
                  Para çekerken sağ üstteki bakiyeye dokunduğunda bu bilgiler otomatik doldurulur.
                </p>
              </div>

              {/* Şifre değiştir */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, opacity: 0.85 }}>{t("profile.changePassword")}</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("profile.newPasswordPlaceholder")}
                  style={fieldInput}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("profile.confirmPasswordPlaceholder")}
                  style={{ ...fieldInput, marginBottom: 10 }}
                />
                {pwMsg ? (
                  <div style={{ fontSize: 12, marginBottom: 10, color: pwMsg.error ? "#fca5a5" : "#86efac", fontWeight: 700 }}>
                    {pwMsg.text}
                  </div>
                ) : null}
                <button
                  onClick={() => void changePassword()}
                  disabled={pwSaving}
                  style={{
                    width: "100%",
                    padding: "11px 0",
                    borderRadius: 12,
                    border: "1px solid rgba(245,215,110,0.4)",
                    background: pwSaving ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                    color: pwSaving ? "white" : "#0a0f1a",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: pwSaving ? "not-allowed" : "pointer",
                    opacity: pwSaving ? 0.6 : 1,
                  }}
                >
                  {pwSaving ? t("profile.updating") : t("profile.updatePassword")}
                </button>
              </div>

              {/* Diğer işlemler */}
              <div style={card}>
                {isAdminEmail(info.email) ? <NavRow label={t("profile.adminPanel")} onClick={() => router.push("/admin")} /> : null}
                <div style={{ marginTop: isAdminEmail(info.email) ? 6 : 0 }}>
                  <NavRow label={t("profile.logout")} onClick={logout} danger />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
