"use client";

import React, { useEffect, useRef } from "react";
import { BottomTabBar } from "./BottomTabBar";
import { TopBar } from "./TopBar";
import { useMapHost } from "./map/MapHostContext";

/**
 * iOS-uygulaması hissi veren paylaşılan kabuk: sabit üst bar + esnek içerik + sabit alt sekme çubuğu.
 * Route değiştirme gerektirmez (route group yerine wrapper) — sayfalar kendi JSX'lerini bunun içine koyar.
 *
 * TopBar/BottomTabBar'ın gerçek render yüksekliğini ölçüp kalıcı harita konteynerine
 * (MapHostContext) yayınlar — böylece harita her zaman TAM OLARAK bu ikisinin arasındaki
 * boşluğu kaplar, kendi iç overlay'leri (Bölgeler paneli, zoom kontrolleri) barların
 * arkasında gizli kalmaz.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { setChromeInsets } = useMapHost();

  useEffect(() => {
    const topEl = topRef.current;
    const bottomEl = bottomRef.current;
    if (!topEl || !bottomEl) return;

    const measure = () => {
      setChromeInsets({ top: topEl.offsetHeight, bottom: bottomEl.offsetHeight });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(topEl);
    ro.observe(bottomEl);
    return () => ro.disconnect();
  }, [setChromeInsets]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        color: "white",
        pointerEvents: "none",
      }}
    >
      <div ref={topRef} style={{ pointerEvents: "auto" }}>
        <TopBar />
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0, pointerEvents: "none" }}>{children}</div>
      <div ref={bottomRef} style={{ pointerEvents: "auto" }}>
        <BottomTabBar />
      </div>
    </div>
  );
}
