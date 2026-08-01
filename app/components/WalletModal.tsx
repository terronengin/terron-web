"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { formatTRY } from "../../lib/wallet";
import { useI18n } from "@/lib/i18n/I18nProvider";

const fieldInput: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "white",
  fontSize: 13,
  outline: "none",
  marginBottom: 8,
  boxSizing: "border-box",
};

const quickAmountBtn: React.CSSProperties = {
  flex: 1,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

export function WalletModal({
  open,
  onClose,
  balance,
  onBalanceChange,
}: {
  open: boolean;
  onClose: () => void;
  balance: number | null;
  onBalanceChange: (v: number) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  const [depositAmount, setDepositAmount] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositMsg, setDepositMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const [wdAmount, setWdAmount] = useState("");
  const [wdBankName, setWdBankName] = useState("");
  const [wdHolderName, setWdHolderName] = useState("");
  const [wdIban, setWdIban] = useState("");
  const [wdBusy, setWdBusy] = useState(false);
  const [wdMsg, setWdMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getSession().then(({ data }) => {
      const meta = data.session?.user?.user_metadata as Record<string, string> | undefined;
      setWdBankName((prev) => prev || (meta?.bank_name ?? ""));
      setWdHolderName((prev) => prev || (meta?.bank_account_holder ?? ""));
      setWdIban((prev) => prev || (meta?.bank_iban ?? ""));
    });
  }, [open]);

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
      if (json.balance != null) onBalanceChange(json.balance);
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
    if (balance != null && amount > balance) {
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
      if (json.balance != null) onBalanceChange(json.balance);
      setWdAmount("");
      setWdMsg({ text: t("profile.msg.withdrawSuccess") });
    } finally {
      setWdBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "70px 14px 14px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 18,
          background: "rgba(9,14,26,0.98)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          padding: 16,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 700, letterSpacing: 0.3 }}>
            {t("profile.walletBalance")}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 14, color: "#F5D76E" }}>
          {balance != null ? `₺${formatTRY(balance)}` : "—"}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setTab("deposit")}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: tab === "deposit" ? "1px solid rgba(245,215,110,0.5)" : "1px solid rgba(255,255,255,0.14)",
              background: tab === "deposit" ? "rgba(245,215,110,0.12)" : "transparent",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("profile.deposit")}
          </button>
          <button
            onClick={() => setTab("withdraw")}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 12,
              border: tab === "withdraw" ? "1px solid rgba(245,215,110,0.5)" : "1px solid rgba(255,255,255,0.14)",
              background: tab === "withdraw" ? "rgba(245,215,110,0.12)" : "transparent",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("profile.withdraw")}
          </button>
        </div>

        {tab === "deposit" ? (
          <div>
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
              <div style={{ fontSize: 12, marginBottom: 8, color: depositMsg.error ? "#fca5a5" : "#86efac", fontWeight: 700 }}>
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
                background: depositBusy ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                color: depositBusy ? "white" : "#0a0f1a",
                fontWeight: 800,
                fontSize: 13,
                cursor: depositBusy ? "not-allowed" : "pointer",
                opacity: depositBusy ? 0.6 : 1,
              }}
            >
              {depositBusy ? t("profile.processing") : t("profile.depositSubmit")}
            </button>
          </div>
        ) : (
          <div>
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
            <div style={{ fontSize: 10.5, opacity: 0.45, marginBottom: 8, lineHeight: 1.4 }}>
              Profil → Banka Bilgileri&apos;nde kayıtlıysa otomatik dolar.
            </div>
            {wdMsg ? (
              <div style={{ fontSize: 12, marginBottom: 8, color: wdMsg.error ? "#fca5a5" : "#86efac", fontWeight: 700 }}>
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
                background: wdBusy ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #e8d48a, #c9a227)",
                color: wdBusy ? "white" : "#0a0f1a",
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

        <p style={{ margin: "14px 0 0", fontSize: 10.5, opacity: 0.45, lineHeight: 1.5 }}>{t("profile.walletDisclaimer")}</p>
      </div>
    </div>
  );
}
