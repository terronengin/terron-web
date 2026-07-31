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
 */

type MapHostContextValue = {
  setMapProps: (props: MapViewProps | null) => void;
};

const MapHostContext = createContext<MapHostContextValue | null>(null);

export function useMapHost(): MapHostContextValue {
  const ctx = useContext(MapHostContext);
  if (!ctx) throw new Error("useMapHost must be used within MapHostProvider");
  return ctx;
}

function PersistentMapHost({ mapProps }: { mapProps: MapViewProps | null }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
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
  const value = useMemo(() => ({ setMapProps }), []);

  return (
    <MapHostContext.Provider value={value}>
      <PersistentMapHost mapProps={mapProps} />
      {children}
    </MapHostContext.Provider>
  );
}
