"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ensureAndLoadWallet, formatTRY } from "../../lib/wallet";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { WalletModal } from "./WalletModal";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setDisplayName(
        (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.name as string) ||
          (u?.email ? u.email.split("@")[0] : "")
      );
      setAvatarUrl((u?.user_metadata?.avatar_url as string) || (u?.user_metadata?.picture as string) || "");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setDisplayName(
        (u?.user_metadata?.full_name as string) ||
          (u?.user_metadata?.name as string) ||
          (u?.email ? u.email.split("@")[0] : "")
      );
      setAvatarUrl((u?.user_metadata?.avatar_url as string) || (u?.user_metadata?.picture as string) || "");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;
    ensureAndLoadWallet().then((v) => {
      if (alive) setWalletBalance(v);
    });
    const timer = setInterval(() => {
      ensureAndLoadWallet().then((v) => {
        if (alive) setWalletBalance(v);
      });
    }, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // Sekme değişiminde de tazele — bir işlem sonrası başka tab'a geçildiğinde bakiye güncel görünsün.
  }, [pathname]);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "calc(9px + env(safe-area-inset-top, 0px)) 14px 9px",
        background: "rgba(9,12,20,0.94)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: "rgba(255,255,255,0.94)",
          flexShrink: 0,
        }}
      >
        Terron<span style={{ color: "#F5D76E" }}>.</span>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => setWalletOpen(true)}
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: "rgba(245,215,110,0.92)",
          padding: "5px 10px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          whiteSpace: "nowrap",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
          cursor: "pointer",
        }}
        title={t("topbar.walletTooltip")}
      >
        {walletBalance != null ? `₺${formatTRY(walletBalance)}` : "—"}
      </button>

      <WalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        balance={walletBalance}
        onBalanceChange={setWalletBalance}
      />

      <button
        onClick={() => router.push("/profile")}
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          color: "white",
          flexShrink: 0,
          cursor: "pointer",
          padding: 0,
        }}
        title={t("topbar.profileTooltip")}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ opacity: 0.85, fontSize: 12.5 }}>{(displayName?.[0] ?? "A").toUpperCase()}</span>
        )}
      </button>
    </div>
  );
}
