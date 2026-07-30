"use client";

import { usePathname, useRouter } from "next/navigation";
import React from "react";

type TabKey = "anasayfa" | "market" | "ekle" | "portfoy" | "profil";

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
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
        color: active ? "#F5D76E" : "rgba(255,255,255,0.55)",
      }}
    >
      <span style={{ fontSize: 19, lineHeight: 1, filter: active ? "none" : "grayscale(0.4) opacity(0.85)" }}>
        {icon}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: 0.1 }}>{label}</span>
      <span
        style={{
          marginTop: 1,
          width: active ? 16 : 0,
          height: 2.5,
          borderRadius: 2,
          background: "#F5D76E",
          transition: "width 0.18s ease",
        }}
      />
    </button>
  );
}

function AddFab({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
      <button
        onClick={onClick}
        aria-label="İlan Ver"
        title="İlan Ver"
        style={{
          position: "absolute",
          top: -20,
          width: 52,
          height: 52,
          borderRadius: 18,
          background: "linear-gradient(135deg, #C9A227, #F5D76E, #B8860B)",
          border: "3px solid #070B14",
          boxShadow: "0 8px 22px rgba(212,175,55,0.45)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 26, fontWeight: 900, color: "#111", lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
}

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

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
        background: "rgba(10,14,24,0.97)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(14px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <TabButton active={activeKey === "anasayfa"} icon="🗺️" label="Anasayfa" onClick={() => go("/dashboard")} />
      <TabButton active={activeKey === "market"} icon="🏷️" label="Market" onClick={() => go("/market")} />
      <AddFab onClick={() => go("/submit-property")} />
      <TabButton active={activeKey === "portfoy"} icon="💼" label="Portföy" onClick={() => go("/portfolio")} />
      <TabButton active={activeKey === "profil"} icon="👤" label="Profil" onClick={() => go("/profile")} />
    </div>
  );
}
