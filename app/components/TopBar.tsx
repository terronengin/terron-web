"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ensureAndLoadWallet, formatTRY } from "../../lib/wallet";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

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
        background: "rgba(255,255,255,0.92)",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 800,
          letterSpacing: 0.5,
          color: "#0F172A",
          flexShrink: 0,
        }}
      >
        Terron<span style={{ color: "#B8860B" }}>.</span>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: "#8A6A0A",
          padding: "5px 10px",
          borderRadius: 10,
          background: "rgba(201,162,39,0.1)",
          border: "1px solid rgba(201,162,39,0.25)",
          whiteSpace: "nowrap",
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
        }}
        title={t("topbar.walletTooltip")}
      >
        {walletBalance != null ? `₺${formatTRY(walletBalance)}` : "—"}
      </div>

      <button
        onClick={() => router.push("/profile")}
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          overflow: "hidden",
          background: "#F1F2F5",
          border: "1px solid rgba(15,23,42,0.1)",
          display: "grid",
          placeItems: "center",
          fontWeight: 700,
          color: "#0F172A",
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
