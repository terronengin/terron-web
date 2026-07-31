"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { supabase } from "@/lib/supabaseClient";
import { ensureAndLoadWallet, formatTRY } from "@/lib/wallet";
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

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "#FFFFFF",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  padding: 16,
};

const rowLabel: React.CSSProperties = { fontSize: 11, opacity: 0.5, fontWeight: 700, letterSpacing: 0.2 };
const rowValue: React.CSSProperties = { fontSize: 14, fontWeight: 700, marginTop: 3 };

const fieldInput: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid rgba(15,23,42,0.14)",
  color: "#0F172A",
  fontSize: 13,
  outline: "none",
  marginBottom: 8,
  boxSizing: "border-box",
};

const quickAmountBtn: React.CSSProperties = {
  flex: 1,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "rgba(15,23,42,0.03)",
  color: "#0F172A",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
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
        borderBottom: "1px solid rgba(15,23,42,0.06)",
        color: danger ? "#DC2626" : "#0F172A",
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [walletPanel, setWalletPanel] = useState<"none" | "deposit" | "withdraw">("none");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositMsg, setDepositMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [wdAmount, setWdAmount] = useState("");
  const [wdBankName, setWdBankName] = useState("");
  const [wdHolderName, setWdHolderName] = useState("");
  const [wdIban, setWdIban] = useState("");
  const [wdBusy, setWdBusy] = useState(false);
  const [wdMsg, setWdMsg] = useState<{ text: string; error?: boolean } | null>(null);
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

  async function authToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function submitDeposit() {
    setDepositMsg(null);
    const amount = Math.round(Number(depositAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setDepositMsg({ text: t("profile.msg.invalidAmount"), error: true });
      return;
    }
    setDepositBusy(true);
    try {
      const token = await authToken();
      if (!token) {
        setDepositMsg({ text: t("profile.msg.sessionExpired"), error: true });
        return;
      }
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; balance?: number };
      if (!res.ok || !json.ok) {
        setDepositMsg({ text: json.error ?? t("profile.msg.depositFailed"), error: true });
        return;
      }
      setWalletBalance(json.balance ?? null);
      setDepositAmount("");
      setDepositMsg({ text: t("profile.msg.depositSuccess", { amount: formatTRY(amount) }) });
    } finally {
      setDepositBusy(false);
    }
  }

  async function submitWithdraw() {
    setWdMsg(null);
    const amount = Math.round(Number(wdAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setWdMsg({ text: t("profile.msg.invalidAmount"), error: true });
      return;
    }
    if (walletBalance != null && amount > walletBalance) {
      setWdMsg({ text: t("profile.msg.overBalance"), error: true });
      return;
    }
    if (!wdBankName.trim() || !wdHolderName.trim() || !wdIban.trim()) {
      setWdMsg({ text: t("profile.msg.bankInfoRequired"), error: true });
      return;
    }
    setWdBusy(true);
    try {
      const token = await authToken();
      if (!token) {
        setWdMsg({ text: t("profile.msg.sessionExpired"), error: true });
        return;
      }
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount,
          bankName: wdBankName.trim(),
          accountHolderName: wdHolderName.trim(),
          iban: wdIban.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; balance?: number };
      if (!res.ok || !json.ok) {
        setWdMsg({ text: json.error ?? t("profile.msg.withdrawFailed"), error: true });
        return;
      }
      setWalletBalance(json.balance ?? null);
      setWdAmount("");
      setWdIban("");
      setWdMsg({ text: t("profile.msg.withdrawSuccess") });
    } finally {
      setWdBusy(false);
    }
  }

  const memberSince = info?.createdAt
    ? new Date(info.createdAt).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <AppShell>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", background: "#FFFFFF", color: "#0F172A" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 14px 40px" }}>
          <h1 style={{ margin: "0 0 16px", fontSize: 19, fontWeight: 800 }}>{t("profile.title")}</h1>

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
                    background: "rgba(15,23,42,0.04)",
                    border: "1px solid rgba(15,23,42,0.1)",
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

              {/* Cüzdan */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={rowLabel}>{t("profile.walletBalance")}</div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: "#B8860B" }}>
                  {walletBalance != null ? `₺${formatTRY(walletBalance)}` : "—"}
                </div>
                <p style={{ margin: "8px 0 14px", fontSize: 11.5, opacity: 0.55, lineHeight: 1.5 }}>
                  {t("profile.walletDisclaimer")}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setWalletPanel(walletPanel === "deposit" ? "none" : "deposit")}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 12,
                      border:
                        walletPanel === "deposit"
                          ? "1px solid rgba(245,215,110,0.5)"
                          : "1px solid rgba(15,23,42,0.14)",
                      background: walletPanel === "deposit" ? "rgba(245,215,110,0.12)" : "#FFFFFF",
                      color: "#0F172A",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t("profile.deposit")}
                  </button>
                  <button
                    onClick={() => setWalletPanel(walletPanel === "withdraw" ? "none" : "withdraw")}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 12,
                      border:
                        walletPanel === "withdraw"
                          ? "1px solid rgba(245,215,110,0.5)"
                          : "1px solid rgba(15,23,42,0.14)",
                      background: walletPanel === "withdraw" ? "rgba(245,215,110,0.12)" : "#FFFFFF",
                      color: "#0F172A",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t("profile.withdraw")}
                  </button>
                </div>

                {walletPanel === "deposit" && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(15,23,42,0.08)" }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {[1000, 5000, 25000, 100000].map((v) => (
                        <button key={v} style={quickAmountBtn} onClick={() => setDepositAmount(String(v))}>
                          ₺{formatTRY(v)}
                        </button>
                      ))}
                    </div>
                    <input
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={t("profile.amountPlaceholder")}
                      inputMode="numeric"
                      style={fieldInput}
                    />
                    {depositMsg ? (
                      <div
                        style={{
                          fontSize: 12,
                          marginBottom: 8,
                          color: depositMsg.error ? "#DC2626" : "#16A34A",
                          fontWeight: 700,
                        }}
                      >
                        {depositMsg.text}
                      </div>
                    ) : null}
                    <button
                      onClick={() => void submitDeposit()}
                      disabled={depositBusy}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 12,
                        border: "1px solid rgba(245,215,110,0.4)",
                        background: depositBusy ? "rgba(15,23,42,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                        color: depositBusy ? "#0F172A" : "#0a0f1a",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: depositBusy ? "not-allowed" : "pointer",
                        opacity: depositBusy ? 0.6 : 1,
                      }}
                    >
                      {depositBusy ? t("profile.processing") : t("profile.depositSubmit")}
                    </button>
                  </div>
                )}

                {walletPanel === "withdraw" && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(15,23,42,0.08)" }}>
                    <input
                      value={wdAmount}
                      onChange={(e) => setWdAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={t("profile.withdrawAmountPlaceholder")}
                      inputMode="numeric"
                      style={fieldInput}
                    />
                    <input
                      value={wdBankName}
                      onChange={(e) => setWdBankName(e.target.value)}
                      placeholder={t("profile.bankNamePlaceholder")}
                      style={fieldInput}
                    />
                    <input
                      value={wdHolderName}
                      onChange={(e) => setWdHolderName(e.target.value)}
                      placeholder={t("profile.accountHolderPlaceholder")}
                      style={fieldInput}
                    />
                    <input
                      value={wdIban}
                      onChange={(e) => setWdIban(e.target.value.toUpperCase())}
                      placeholder={t("profile.ibanPlaceholder")}
                      style={fieldInput}
                    />
                    {wdMsg ? (
                      <div
                        style={{
                          fontSize: 12,
                          marginBottom: 8,
                          color: wdMsg.error ? "#DC2626" : "#16A34A",
                          fontWeight: 700,
                        }}
                      >
                        {wdMsg.text}
                      </div>
                    ) : null}
                    <button
                      onClick={() => void submitWithdraw()}
                      disabled={wdBusy}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 12,
                        border: "1px solid rgba(245,215,110,0.4)",
                        background: wdBusy ? "rgba(15,23,42,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                        color: wdBusy ? "#0F172A" : "#0a0f1a",
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: wdBusy ? "not-allowed" : "pointer",
                        opacity: wdBusy ? 0.6 : 1,
                      }}
                    >
                      {wdBusy ? t("profile.processing") : t("profile.withdrawSubmit")}
                    </button>
                  </div>
                )}
              </div>

              {/* Kişisel bilgiler */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, opacity: 0.85 }}>{t("profile.personalInfo")}</div>
                <InfoRow label={t("profile.fullName")} value={info.displayName} />
                <InfoRow label={t("profile.email")} value={info.email} />
                <InfoRow label={t("profile.city")} value={info.city} />
                <InfoRow label={t("profile.district")} value={info.district} />
              </div>

              {/* Dil */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, opacity: 0.85 }}>{t("profile.languageSection")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LOCALES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLocale(l.code)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: locale === l.code ? "1px solid rgba(245,215,110,0.5)" : "1px solid rgba(15,23,42,0.12)",
                        background: locale === l.code ? "rgba(245,215,110,0.12)" : "rgba(15,23,42,0.02)",
                        color: "#0F172A",
                        fontSize: 12.5,
                        fontWeight: locale === l.code ? 800 : 600,
                        cursor: "pointer",
                      }}
                    >
                      {l.nativeLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hesap bilgileri */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4, opacity: 0.85 }}>{t("profile.accountInfo")}</div>
                <InfoRow label={t("profile.memberSince")} value={memberSince} />
                <InfoRow label={t("profile.emailVerification")} value={info.emailConfirmed ? t("profile.verified") : t("profile.notVerified")} />
              </div>

              {/* Şifre değiştir */}
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, opacity: 0.85 }}>{t("profile.changePassword")}</div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("profile.newPasswordPlaceholder")}
                  style={{
                    width: "100%",
                    height: 40,
                    padding: "0 12px",
                    borderRadius: 12,
                    background: "#FFFFFF",
                    border: "1px solid rgba(15,23,42,0.14)",
                    color: "#0F172A",
                    fontSize: 13,
                    outline: "none",
                    marginBottom: 8,
                    boxSizing: "border-box",
                  }}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("profile.confirmPasswordPlaceholder")}
                  style={{
                    width: "100%",
                    height: 40,
                    padding: "0 12px",
                    borderRadius: 12,
                    background: "#FFFFFF",
                    border: "1px solid rgba(15,23,42,0.14)",
                    color: "#0F172A",
                    fontSize: 13,
                    outline: "none",
                    marginBottom: 10,
                    boxSizing: "border-box",
                  }}
                />
                {pwMsg ? (
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 10,
                      color: pwMsg.error ? "#DC2626" : "#16A34A",
                      fontWeight: 700,
                    }}
                  >
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
                    background: pwSaving ? "rgba(15,23,42,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                    color: pwSaving ? "#0F172A" : "#0a0f1a",
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
                <NavRow label={t("profile.requests")} onClick={() => router.push("/inquiries")} />
                <NavRow label={t("profile.listProperty")} onClick={() => router.push("/submit-property")} />
                {isAdminEmail(info.email) ? <NavRow label={t("profile.adminPanel")} onClick={() => router.push("/admin")} /> : null}
                <div style={{ marginTop: 6 }}>
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
