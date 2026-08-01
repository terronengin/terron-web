"use client";

import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; resetKey: number };

/**
 * mapbox-gl'nin kendi iç render döngüsünde (özellikle flyTo/easeTo animasyonu ile bir
 * kaynağın (Source) aynı anda kaldırılması — bkz. MapPolygonLayer.tsx notu) ara sıra
 * yakalanamayan bir TypeError atıp tüm React ağacını çökertebiliyor ("Application error").
 * Kullanıcıya bu, "baloncuğa tıklayınca hiçbir şey olmuyor / uygulama patlıyor" gibi görünüyor.
 * Bu sınır sadece haritayı izole eder: çökme olursa TÜM SAYFA değil, sadece harita kısa süreliğine
 * yeniden kurulur (childeki mapProps/level state'i zaten Dashboard tarafında tutuluyor, harita
 * bileşeninin kendisi state'siz yeniden monte edilebilir).
 */
export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[map] internal render error, remounting map:", error);
    window.setTimeout(() => {
      this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }));
    }, 150);
  }

  render() {
    if (this.state.hasError) return null;
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
