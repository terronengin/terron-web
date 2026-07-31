"use client";

import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";

type TabKey = "anasayfa" | "market" | "ekle" | "portfoy" | "profil";

type IconProps = { size?: number; active?: boolean };

function HomeIcon({ size = 22, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 11.5 12 4l8 7.5"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V10"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.12 : 0}
      />
    </svg>
  );
}

function TagIcon({ size = 22, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.6 4H6a2 2 0 0 0-2 2v5.6a2 2 0 0 0 .59 1.41l8.4 8.4a2 2 0 0 0 2.82 0l5.6-5.6a2 2 0 0 0 0-2.82l-8.4-8.4A2 2 0 0 0 11.6 4Z"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.12 : 0}
      />
      <circle cx="8.2" cy="8.2" r="1.35" fill="currentColor" />
    </svg>
  );
}

function BriefcaseIcon({ size = 22, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="3.25"
        y="8"
        width="17.5"
        height="11.5"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.12 : 0}
      />
      <path
        d="M8.5 8V6.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V8"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        strokeLinecap="round"
      />
      <path d="M3.25 13h17.5" stroke="currentColor" strokeWidth={active ? 2.1 : 1.8} />
    </svg>
  );
}

function UserIcon({ size = 22, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="12"
        cy="8"
        r="3.5"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.14 : 0}
      />
      <path
        d="M4.75 19.5c.9-3.4 3.9-5.5 7.25-5.5s6.35 2.1 7.25 5.5"
        stroke="currentColor"
        strokeWidth={active ? 2.1 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function TabButton({
  active,
  Icon,
  label,
  onClick,
}: {
  active: boolean;
  Icon: React.ComponentType<IconProps>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "8px 2px 6px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: active ? "#B8860B" : "rgba(15,23,42,0.55)",
      }}
    >
      <Icon size={22} active={active} />
      <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: 0.1 }}>{label}</span>
      <span
        style={{
          marginTop: 1,
          width: active ? 16 : 0,
          height: 2.5,
          borderRadius: 2,
          background: "#C9A227",
          transition: "width 0.18s ease",
        }}
      />
    </button>
  );
}

function AddFab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
      <button
        onClick={onClick}
        aria-label={label}
        title={label}
        style={{
          position: "absolute",
          top: -12,
          width: 38,
          height: 38,
          borderRadius: 13,
          background: "linear-gradient(135deg, #C9A227, #F5D76E, #B8860B)",
          border: "2.5px solid #FFFFFF",
          boxShadow: "0 6px 16px rgba(184,134,11,0.35)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 900, color: "#111", lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
}

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const activeKey: TabKey | "" =
    pathname?.startsWith("/dashboard") ? "anasayfa" :
    pathname?.startsWith("/market") ? "market" :
    pathname?.startsWith("/submit-property") ? "ekle" :
    pathname?.startsWith("/portfolio") ? "portfoy" :
    pathname?.startsWith("/profile") || pathname?.startsWith("/inquiries") || pathname?.startsWith("/admin") ? "profil" :
    "";

  function go(href: string) {
    router.push(href);
  }

  return (
    <div
      style={{
        position: "relative",
        zIndex: 30,
        display: "flex",
        alignItems: "stretch",
        background: "rgba(255,255,255,0.96)",
        borderTop: "1px solid rgba(15,23,42,0.08)",
        backdropFilter: "blur(14px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <TabButton active={activeKey === "anasayfa"} Icon={HomeIcon} label={t("nav.home")} onClick={() => go("/dashboard")} />
      <TabButton active={activeKey === "market"} Icon={TagIcon} label={t("nav.market")} onClick={() => go("/market")} />
      <AddFab label={t("nav.add")} onClick={() => go("/submit-property")} />
      <TabButton active={activeKey === "portfoy"} Icon={BriefcaseIcon} label={t("nav.portfolio")} onClick={() => go("/portfolio")} />
      <TabButton active={activeKey === "profil"} Icon={UserIcon} label={t("nav.profile")} onClick={() => go("/profile")} />
    </div>
  );
}
