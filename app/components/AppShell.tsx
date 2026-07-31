"use client";

import React from "react";
import { BottomTabBar } from "./BottomTabBar";
import { TopBar } from "./TopBar";

/**
 * iOS-uygulaması hissi veren paylaşılan kabuk: sabit üst bar + esnek içerik + sabit alt sekme çubuğu.
 * Route değiştirme gerektirmez (route group yerine wrapper) — sayfalar kendi JSX'lerini bunun içine koyar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#070B14",
        color: "white",
      }}
    >
      <TopBar />
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>{children}</div>
      <BottomTabBar />
    </div>
  );
}
