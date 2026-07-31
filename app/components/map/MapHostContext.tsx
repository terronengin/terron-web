"use client";

import { usePathname } from "next/navigation";
import React, { createContext, useContext, useMemo, useState } from "react";
import MapViewV2 from "./MapViewV2";
import type { MapViewProps } from "./map.types";

/**
 * Harita bileşeni (Mapbox GL/WebGL) burada, kök layout seviyesinde tek sefer
 * kurulur ve sekmeler arası geçişte hiç unmount olmaz — sadece Anasayfa dışındayken
 * görünmez/etkileşimsiz yapılır. Anasayfa kendi state'ini (items, seçim callback'leri)
 * setMapProps ile buraya "yayınlar"; harita hep aynı örnek olarak kalır.
 *
 * chromeInsets: TopBar/BottomTabBar tam viewport yüksekliğinde opak barlar olduğu
 * için kalıcı harita konteyneri inset:0 (tüm ekran) yaparsa haritanın kendi iç
 * overlay'leri (Bölgeler paneli, zoom kontrolleri, attribution) TopBar'ın ARKASINDA
 * kalır — DOM'da var ama görsel olarak TopBar'ın altında gizlenir. AppShell bu
 * barların gerçek render yüksekliğini ölçüp buraya yayınlar; harita konteyneri de
 * tam o boşluğu kaplar (eskiden Dashboard'un kendi "top:headerH" div'inin yaptığı gibi).
 */

type ChromeInsets = { top: number; bottom: number };

type MapHostContextValue = {
  setMapProps: (props: MapViewProps | null) => void;
  setChromeInsets: (insets: ChromeInsets) => void;
};

const MapHostContext = createContext<MapHostContextValue | null>(null);

export function useMapHost(): MapHostContextValue {
  const ctx = useContext(MapHostContext);
  if (!ctx) throw new Error("useMapHost must be used within MapHostProvider");
  return ctx;
}

function PersistentMapHost({
  mapProps,
  chromeInsets,
}: {
  mapProps: MapViewProps | null;
  chromeInsets: ChromeInsets;
}) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: chromeInsets.top,
        bottom: chromeInsets.bottom,
        zIndex: 0,
        visibility: isDashboard ? "visible" : "hidden",
        pointerEvents: isDashboard ? "auto" : "none",
      }}
    >
      {mapProps ? <MapViewV2 {...mapProps} /> : null}
    </div>
  );
}

export function MapHostProvider({ children }: { children: React.ReactNode }) {
  const [mapProps, setMapProps] = useState<MapViewProps | null>(null);
  // Gerçek TopBar/BottomTabBar yüksekliklerine yakın varsayılanlarla başlar — 0'dan
  // gerçeğe ani bir sıçrama olmasın diye (mapbox konteyner resize sırasında stil
  // yüklemesini bozabiliyor).
  const [chromeInsets, setChromeInsets] = useState<ChromeInsets>({ top: 56, bottom: 64 });
  const value = useMemo(() => ({ setMapProps, setChromeInsets }), []);

  return (
    <MapHostContext.Provider value={value}>
      <PersistentMapHost mapProps={mapProps} chromeInsets={chromeInsets} />
      {children}
    </MapHostContext.Provider>
  );
}
