"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ViewMode = "login" | "register" | "forgot";

type GlobePoint = {
  id: string;
  lat: number;
  lon: number;
  size?: number;
};

type ProjectedPoint = {
  id: string;
  x: number;
  y: number;
  z: number;
  visible: boolean;
  size: number;
};

type MarketResponse = {
  USDTRY?: string | number | null;
  EURTRY?: string | number | null;
  GBPTRY?: string | number | null;
  BTC?: number | null;
  ETH?: number | null;
  error?: string;
};

const GLOBE_POINTS: GlobePoint[] = [
  { id: "ny", lat: 40.7128, lon: -74.006, size: 1.2 },
  { id: "la", lat: 34.0522, lon: -118.2437, size: 0.98 },
  { id: "toronto", lat: 43.6532, lon: -79.3832, size: 0.9 },
  { id: "mexico", lat: 19.4326, lon: -99.1332, size: 0.88 },
  { id: "bogota", lat: 4.711, lon: -74.0721, size: 0.84 },
  { id: "lima", lat: -12.0464, lon: -77.0428, size: 0.84 },
  { id: "saopaulo", lat: -23.5505, lon: -46.6333, size: 1.02 },
  { id: "buenosaires", lat: -34.6037, lon: -58.3816, size: 0.86 },

  { id: "london", lat: 51.5072, lon: -0.1276, size: 1.08 },
  { id: "paris", lat: 48.8566, lon: 2.3522, size: 0.92 },
  { id: "madrid", lat: 40.4168, lon: -3.7038, size: 0.9 },
  { id: "berlin", lat: 52.52, lon: 13.405, size: 0.92 },
  { id: "amsterdam", lat: 52.3676, lon: 4.9041, size: 0.86 },
  { id: "rome", lat: 41.9028, lon: 12.4964, size: 0.86 },
  { id: "stockholm", lat: 59.3293, lon: 18.0686, size: 0.82 },

  { id: "istanbul", lat: 41.0082, lon: 28.9784, size: 1.28 },
  { id: "ankara", lat: 39.9334, lon: 32.8597, size: 0.88 },
  { id: "izmir", lat: 38.4237, lon: 27.1428, size: 0.86 },
  { id: "dubai", lat: 25.2048, lon: 55.2708, size: 1.04 },
  { id: "riyadh", lat: 24.7136, lon: 46.6753, size: 0.84 },
  { id: "doha", lat: 25.2854, lon: 51.531, size: 0.8 },
  { id: "tehran", lat: 35.6892, lon: 51.389, size: 0.84 },

  { id: "cairo", lat: 30.0444, lon: 31.2357, size: 0.9 },
  { id: "lagos", lat: 6.5244, lon: 3.3792, size: 0.88 },
  { id: "nairobi", lat: -1.2921, lon: 36.8219, size: 0.84 },
  { id: "johannesburg", lat: -26.2041, lon: 28.0473, size: 0.86 },
  { id: "casablanca", lat: 33.5731, lon: -7.5898, size: 0.8 },

  { id: "mumbai", lat: 19.076, lon: 72.8777, size: 1.0 },
  { id: "delhi", lat: 28.6139, lon: 77.209, size: 0.94 },
  { id: "karachi", lat: 24.8607, lon: 67.0011, size: 0.84 },
  { id: "bangkok", lat: 13.7563, lon: 100.5018, size: 0.88 },
  { id: "singapore", lat: 1.3521, lon: 103.8198, size: 1.0 },
  { id: "jakarta", lat: -6.2088, lon: 106.8456, size: 0.88 },
  { id: "hongkong", lat: 22.3193, lon: 114.1694, size: 0.9 },
  { id: "seoul", lat: 37.5665, lon: 126.978, size: 0.9 },
  { id: "tokyo", lat: 35.6762, lon: 139.6503, size: 1.14 },
  { id: "osaka", lat: 34.6937, lon: 135.5023, size: 0.84 },
  { id: "beijing", lat: 39.9042, lon: 116.4074, size: 0.92 },
  { id: "shanghai", lat: 31.2304, lon: 121.4737, size: 0.94 },

  { id: "sydney", lat: -33.8688, lon: 151.2093, size: 0.96 },
  { id: "melbourne", lat: -37.8136, lon: 144.9631, size: 0.9 },
  { id: "auckland", lat: -36.8509, lon: 174.7645, size: 0.8 },
];

const EXTRA_GLOW_POINTS: GlobePoint[] = [
  { id: "miami", lat: 25.7617, lon: -80.1918, size: 0.58 },
  { id: "chicago", lat: 41.8781, lon: -87.6298, size: 0.56 },
  { id: "santiago", lat: -33.4489, lon: -70.6693, size: 0.54 },
  { id: "lisbon", lat: 38.7223, lon: -9.1393, size: 0.54 },
  { id: "vienna", lat: 48.2082, lon: 16.3738, size: 0.5 },
  { id: "athens", lat: 37.9838, lon: 23.7275, size: 0.5 },
  { id: "baku", lat: 40.4093, lon: 49.8671, size: 0.52 },
  { id: "jeddah", lat: 21.4858, lon: 39.1925, size: 0.52 },
  { id: "algiers", lat: 36.7538, lon: 3.0588, size: 0.5 },
  { id: "accra", lat: 5.6037, lon: -0.187, size: 0.5 },
  { id: "addis", lat: 8.9806, lon: 38.7578, size: 0.5 },
  { id: "almaty", lat: 43.222, lon: 76.8512, size: 0.5 },
  { id: "manila", lat: 14.5995, lon: 120.9842, size: 0.52 },
  { id: "taipei", lat: 25.033, lon: 121.5654, size: 0.52 },
  { id: "perth", lat: -31.9505, lon: 115.8605, size: 0.48 },
];

const ALL_GLOBE_POINTS = [...GLOBE_POINTS, ...EXTRA_GLOW_POINTS];

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<ViewMode>("login");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [resetEmail, setResetEmail] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");

  const [marketData, setMarketData] = useState<MarketResponse | null>(null);

  const totalUsers = 216;

  useEffect(() => {
    const remembered =
      typeof window !== "undefined" ? localStorage.getItem("terron_remember_me") : null;
    const savedEmail =
      typeof window !== "undefined" ? localStorage.getItem("terron_saved_email") : null;

    if (remembered !== null) setRememberMe(remembered === "true");
    if (savedEmail) setLoginEmail(savedEmail);

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.push("/dashboard");
    }

    checkSession();
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function loadMarket() {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        const data: MarketResponse = await res.json();
        if (!mounted) return;
        if (!data?.error) setMarketData(data);
      } catch {
        // fallback
      }
    }

    loadMarket();
    const timer = setInterval(loadMarket, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  function showMessage(text: string, error = false) {
    setMsg(text);
    setIsError(error);
  }

  async function signIn() {
    try {
      setLoading(true);
      setMsg(null);

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        showMessage(error.message, true);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("terron_remember_me", String(rememberMe));
        if (rememberMe) {
          localStorage.setItem("terron_saved_email", loginEmail.trim());
        } else {
          localStorage.removeItem("terron_saved_email");
        }
      }

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function signUp() {
    try {
      setLoading(true);
      setMsg(null);

      if (!fullName || !username || !registerEmail || !registerPassword || !registerPasswordConfirm) {
        showMessage("Lütfen zorunlu alanları doldurun.", true);
        return;
      }

      if (registerPassword.length < 6) {
        showMessage("Şifre en az 6 karakter olmalı.", true);
        return;
      }

      if (registerPassword !== registerPasswordConfirm) {
        showMessage("Şifreler uyuşmuyor.", true);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: registerEmail.trim(),
        password: registerPassword,
        options: {
          data: {
            full_name: fullName,
            username,
            city,
            district,
          },
        },
      });

      if (error) {
        showMessage(error.message, true);
        return;
      }

      const userId = data.user?.id;

      if (userId) {
        await supabase.from("profiles").upsert({
          id: userId,
          full_name: fullName,
          username,
          email: registerEmail.trim(),
          city,
          district,
        });
      }

      showMessage("Üyelik oluşturuldu. Giriş yapabilirsiniz.");
      setMode("login");
      setLoginEmail(registerEmail.trim());
      setLoginPassword(registerPassword);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    try {
      setLoading(true);
      setMsg(null);

      if (!resetEmail.trim()) {
        showMessage("Lütfen e-posta adresinizi girin.", true);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
      });

      if (error) {
        showMessage(error.message, true);
        return;
      }

      showMessage("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } finally {
      setLoading(false);
    }
  }

  const cityTickerItems = useMemo(
    () => [
      { label: "İSTANBUL", value: "+12.4%", positive: true },
      { label: "ANKARA", value: "+8.1%", positive: true },
      { label: "İZMİR", value: "+9.7%", positive: true },
      { label: "ANTALYA", value: "+14.2%", positive: true },
      { label: "BURSA", value: "+7.8%", positive: true },
      { label: "KOCAELİ", value: "+10.5%", positive: true },
      { label: "LONDON", value: "+6.9%", positive: true },
      { label: "DUBAI", value: "+11.8%", positive: true },
      { label: "SINGAPORE", value: "+5.7%", positive: true },
      { label: "TOKYO", value: "+4.6%", positive: true },
    ],
    []
  );

  const financeTickerItems = useMemo(() => {
    const fallback = [
      { label: "USD/TRY", value: "…", positive: true },
      { label: "EUR/TRY", value: "…", positive: true },
      { label: "GBP/TRY", value: "…", positive: true },
      { label: "BTC/USD", value: "…", positive: true },
      { label: "ETH/USD", value: "…", positive: true },
      { label: "LIVE", value: "MARKET", positive: true },
    ];

    if (!marketData) return fallback;

    return [
      { label: "USD/TRY", value: formatTryPair(marketData.USDTRY), positive: true },
      { label: "EUR/TRY", value: formatTryPair(marketData.EURTRY), positive: true },
      { label: "GBP/TRY", value: formatTryPair(marketData.GBPTRY), positive: true },
      { label: "BTC/USD", value: formatUsd(marketData.BTC), positive: true },
      { label: "ETH/USD", value: formatUsd(marketData.ETH), positive: true },
      { label: "LIVE", value: "REAL DATA", positive: true },
    ];
  }, [marketData]);

  const isRegister = mode === "register";

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at top, #18345c 0%, #0a1731 24%, #061020 50%, #030812 74%, #010307 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(10px, 2vw, 20px)",
      }}
    >
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
        }

        input::placeholder {
          color: rgba(203, 213, 225, 0.48);
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        select:-webkit-autofill {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0px 1000px rgba(255, 255, 255, 0.04) inset;
          transition: background-color 9999s ease-in-out 0s;
        }

        @keyframes terronTicker {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @keyframes terronTickerReverse {
          0% {
            transform: translate3d(-50%, 0, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes terronGlowPulse {
          0%,
          100% {
            opacity: 0.72;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        @keyframes terronFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        .terron-ticker-shell {
          overflow: hidden;
          width: 100%;
        }

        .terron-ticker-track {
          display: flex;
          width: max-content;
          min-width: max-content;
          will-change: transform;
          animation: terronTicker 28s linear infinite;
        }

        .terron-ticker-track-reverse {
          display: flex;
          width: max-content;
          min-width: max-content;
          will-change: transform;
          animation: terronTickerReverse 32s linear infinite;
        }

        .terron-glow-dot {
          animation: terronGlowPulse 2.8s ease-in-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }

        .terron-float {
          animation: terronFloat 5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .terron-ticker-track,
          .terron-ticker-track-reverse,
          .terron-glow-dot,
          .terron-float {
            animation: none !important;
          }
        }

        @media (max-width: 1060px) {
          .terron-main-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .terron-globe-panel {
            min-height: 260px !important;
            order: 2;
          }

          .terron-form-panel {
            order: 1;
          }
        }

        @media (max-width: 760px) {
          .terron-page-shell {
            border-radius: 24px !important;
            padding: 14px !important;
          }

          .terron-register-grid {
            grid-template-columns: 1fr !important;
          }

          .terron-logo-wrap {
            gap: 10px !important;
            margin-bottom: 8px !important;
          }

          .terron-logo-icon {
            width: 50px !important;
            height: 60px !important;
            border-radius: 16px !important;
            font-size: 24px !important;
          }

          .terron-logo-right {
            height: 60px !important;
          }

          .terron-logo-title {
            font-size: 26px !important;
            letter-spacing: 0.5px !important;
          }

          .terron-logo-civil {
            font-size: 9px !important;
            letter-spacing: 3px !important;
          }

          .terron-brand-sub {
            font-size: 8px !important;
            letter-spacing: 1.3px !important;
            margin-top: 4px !important;
          }

          .terron-globe-panel {
            min-height: 220px !important;
          }

          .terron-mobile-stack {
            margin-top: 8px !important;
          }

          .terron-user-card {
            max-width: 120px !important;
            padding: 8px 10px !important;
            border-radius: 12px !important;
          }

          .terron-user-card-label {
            font-size: 8px !important;
            margin-bottom: 3px !important;
          }

          .terron-user-card-value {
            font-size: 16px !important;
          }
        }

        @media (max-width: 560px) {
          .terron-page-shell {
            min-height: calc(100vh - 20px);
            border-radius: 22px !important;
            padding: 12px !important;
          }

          .terron-main-grid {
            gap: 10px !important;
          }

          .terron-globe-panel {
            min-height: 200px !important;
          }

          .terron-form-panel {
            margin-top: 4px !important;
          }

          .terron-logo-wrap {
            justify-content: flex-start !important;
            margin-bottom: 6px !important;
          }

          .terron-logo-icon {
            width: 46px !important;
            height: 56px !important;
            font-size: 22px !important;
            border-radius: 14px !important;
          }

          .terron-logo-right {
            height: 56px !important;
          }

          .terron-logo-title {
            font-size: 24px !important;
            letter-spacing: 0.35px !important;
          }

          .terron-logo-civil {
            font-size: 8px !important;
            letter-spacing: 2.6px !important;
          }

          .terron-brand-sub {
            font-size: 7px !important;
            letter-spacing: 1.1px !important;
          }

          .terron-form-actions-row {
            gap: 8px !important;
          }

          .terron-bottom-note {
            font-size: 11px !important;
            line-height: 1.55 !important;
            margin-top: 16px !important;
          }

          .terron-globe-topbar {
            top: 10px !important;
            left: 10px !important;
            right: 10px !important;
          }

          .terron-user-card {
            margin-top: 4px !important;
          }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: "42px 42px",
          opacity: 0.11,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.24,
          background: `
            radial-gradient(circle at 14% 16%, rgba(255,215,120,0.12), transparent 18%),
            radial-gradient(circle at 82% 14%, rgba(234,29,36,0.08), transparent 16%),
            radial-gradient(circle at 72% 72%, rgba(255,215,120,0.10), transparent 20%),
            radial-gradient(circle at 24% 78%, rgba(255,255,255,0.04), transparent 18%)
          `,
        }}
      />

      <div
        className="terron-page-shell"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: isRegister ? 980 : 1180,
          background:
            "linear-gradient(180deg, rgba(5,12,24,0.82) 0%, rgba(5,15,34,0.92) 46%, rgba(6,17,39,0.96) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 28,
          padding: isRegister ? 22 : 18,
          boxShadow:
            "0 34px 100px rgba(0,0,0,0.54), inset 0 1px 0 rgba(255,255,255,0.04)",
          backdropFilter: "blur(18px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 18,
            right: 18,
            height: 1,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.72) 25%, rgba(247,210,122,0.96) 50%, rgba(247,210,122,0.72) 75%, transparent 100%)",
          }}
        />

        <TickerBar
          items={financeTickerItems}
          title="GLOBAL MARKET FEED"
          reverse={false}
          accent="#f7d27a"
        />

        <div style={{ height: 8 }} />

        <TickerBar
          items={cityTickerItems}
          title="CITY PERFORMANCE BELT"
          reverse
          accent="#9fb6d9"
        />

        <div
          className="terron-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: isRegister ? "1fr" : "1.04fr 0.96fr",
            gap: 18,
            alignItems: "stretch",
            marginTop: 12,
          }}
        >
          {!isRegister && (
            <div
              className="terron-globe-panel"
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
                minHeight: 520,
                border: "1px solid rgba(255,255,255,0.07)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -30px 70px rgba(0,0,0,0.2)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `
                    linear-gradient(rgba(247,210,122,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(247,210,122,0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: "28px 28px",
                  opacity: 0.22,
                  pointerEvents: "none",
                }}
              />

              <div
                className="terron-globe-topbar"
                style={{
                  position: "absolute",
                  top: 14,
                  left: 14,
                  right: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    padding: "7px 10px",
                    borderRadius: 999,
                    background: "rgba(247,210,122,0.08)",
                    border: "1px solid rgba(247,210,122,0.18)",
                    color: "#f5deb0",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.9,
                    whiteSpace: "nowrap",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  TERRONTR.COM
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 44,
                  bottom: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 8px",
                }}
              >
                <InteractiveGlobe />
              </div>

              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  bottom: 12,
                  zIndex: 2,
                }}
              >
                <MiniMetric label="Veri Katmanı" value="CANLI" highlight />
              </div>
            </div>
          )}

          <div className="terron-form-panel" style={{ position: "relative", zIndex: 1 }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div
                className="terron-logo-wrap"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <div
                  className="terron-logo-icon terron-float"
                  style={{
                    width: 58,
                    height: 68,
                    borderRadius: 18,
                    background: "linear-gradient(135deg, #ea1d24 0%, #a60f14 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: 28,
                    fontWeight: 900,
                    boxShadow:
                      "0 20px 36px rgba(234,29,36,0.30), inset 0 1px 0 rgba(255,255,255,0.14)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    flexShrink: 0,
                  }}
                >
                  T
                </div>

                <div
                  className="terron-logo-right"
                  style={{
                    textAlign: "left",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    height: 68,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "fit-content",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                    }}
                  >
                    <div
                      className="terron-logo-title"
                      style={{
                        color: "#ffffff",
                        fontSize: 30,
                        fontWeight: 900,
                        letterSpacing: 0.6,
                        lineHeight: 0.95,
                        textShadow: "0 8px 24px rgba(0,0,0,0.25)",
                      }}
                    >
                      TERRON
                    </div>

                    <div
                      className="terron-logo-civil"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#f7d27a",
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: 3.8,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        textShadow: "0 0 18px rgba(247,210,122,0.22)",
                        lineHeight: 1,
                      }}
                    >
                      CIVIL
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "50%",
                        height: 1,
                        background:
                          "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.0) 8%, rgba(247,210,122,0.48) 50%, rgba(247,210,122,0.0) 92%, transparent 100%)",
                        transform: "translateY(-1px)",
                        pointerEvents: "none",
                        opacity: 0.7,
                      }}
                    />
                  </div>

                  <div
                    className="terron-brand-sub"
                    style={{
                      marginTop: 5,
                      color: "#f7d27a",
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 1.6,
                    }}
                  >
                    DIGITAL LAND INVESTMENT
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "7px 12px",
                  marginBottom: 8,
                  borderRadius: 999,
                  border: "1px solid rgba(247,215,122,0.18)",
                  background: "rgba(247,215,122,0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    color: "#f4e3b2",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                  }}
                >
                  DİJİTAL YATIRIM PLATFORMU
                </span>
              </div>

              <div
                className="terron-mobile-stack"
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
                <div
                  className="terron-user-card"
                  style={{
                    minWidth: 0,
                    padding: "9px 12px",
                    borderRadius: 14,
                    background:
                      "linear-gradient(180deg, rgba(247,210,122,0.10) 0%, rgba(247,210,122,0.04) 100%)",
                    border: "1px solid rgba(247,210,122,0.16)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
                    textAlign: "center",
                    maxWidth: 140,
                    marginInline: "auto",
                  }}
                >
                  <div
                    className="terron-user-card-label"
                    style={{
                      color: "#f4d58d",
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Toplam Kullanıcı
                  </div>
                  <div
                    className="terron-user-card-value"
                    style={{
                      color: "#ffffff",
                      fontSize: 18,
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {totalUsers.toLocaleString("tr-TR")}
                  </div>
                </div>
              </div>
            </div>

            {mode === "login" && (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="E-posta">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Şifre">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    style={inputStyle}
                  />
                </Field>

                <div
                  className="terron-form-actions-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#cbd5e1",
                      fontSize: 14,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    Beni hatırla
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setResetEmail(loginEmail);
                      setMsg(null);
                    }}
                    style={linkButtonStyle}
                  >
                    Şifremi unuttum
                  </button>
                </div>

                <button onClick={signIn} disabled={loading} style={primaryButtonStyle}>
                  {loading ? "Bekleyin..." : "Giriş Yap"}
                </button>

                <button
                  onClick={() => {
                    setMode("register");
                    setMsg(null);
                  }}
                  disabled={loading}
                  style={secondaryButtonStyle}
                >
                  Üyelik Oluştur
                </button>
              </div>
            )}

            {mode === "forgot" && (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Kayıtlı e-posta">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    style={inputStyle}
                  />
                </Field>

                <button onClick={resetPassword} disabled={loading} style={primaryButtonStyle}>
                  {loading ? "Gönderiliyor..." : "Şifre Sıfırlama Linki Gönder"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setMsg(null);
                  }}
                  style={secondaryButtonStyle}
                >
                  Girişe Dön
                </button>
              </div>
            )}

            {mode === "register" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  className="terron-register-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <Field label="İsim Soyisim *">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ad Soyad"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Kullanıcı Adı *">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="@kullaniciadi"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="E-posta *">
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="ornek@eposta.com"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Şifre *">
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Şifre Tekrar *">
                    <input
                      type="password"
                      value={registerPasswordConfirm}
                      onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                      placeholder="Şifre tekrar"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="İl">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="İstanbul"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="İlçe">
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder="Kadıköy"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <button onClick={signUp} disabled={loading} style={primaryButtonStyle}>
                  {loading ? "Üyelik oluşturuluyor..." : "Hesabı Oluştur"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setMsg(null);
                  }}
                  style={secondaryButtonStyle}
                >
                  Giriş Ekranına Dön
                </button>
              </div>
            )}

            {msg && (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  padding: "12px 13px",
                  background: isError ? "rgba(239, 68, 68, 0.10)" : "rgba(34, 197, 94, 0.10)",
                  border: isError
                    ? "1px solid rgba(239, 68, 68, 0.22)"
                    : "1px solid rgba(34, 197, 94, 0.22)",
                  color: isError ? "#fca5a5" : "#86efac",
                  fontSize: 14,
                }}
              >
                {msg}
              </div>
            )}

            <div
              className="terron-bottom-note"
              style={{
                marginTop: 18,
                textAlign: "center",
                color: "#64748b",
                fontSize: 12,
                letterSpacing: 0.4,
              }}
            >
              TERRONTR.COM • Profesyonel dijital gayrimenkul yatırım deneyimi
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerBar({
  items,
  title,
  reverse = false,
  accent,
}: {
  items: { label: string; value: string; positive: boolean }[];
  title: string;
  reverse?: boolean;
  accent: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.025)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 16px ${accent}55`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: "#e2e8f0",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.2,
          }}
        >
          {title}
        </span>
      </div>

      <div className="terron-ticker-shell">
        <div className={reverse ? "terron-ticker-track-reverse" : "terron-ticker-track"}>
          {[...items, ...items].map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 16px",
                borderRight: "1px solid rgba(255,255,255,0.06)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: accent,
                  boxShadow: `0 0 14px ${accent}66`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  color: item.positive ? "#86efac" : "#fca5a5",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 8,
          color: "#cbd5e1",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: "10px 14px",
        borderRadius: 14,
        background: highlight ? "rgba(247,210,122,0.09)" : "rgba(255,255,255,0.04)",
        border: highlight
          ? "1px solid rgba(247,210,122,0.20)"
          : "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(10px)",
        textAlign: "center",
        boxShadow: highlight ? "0 10px 24px rgba(0,0,0,0.18)" : undefined,
      }}
    >
      <div
        style={{
          color: highlight ? "#f4d58d" : "#94a3b8",
          fontSize: 9,
          fontWeight: 800,
          marginBottom: 4,
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#ffffff",
          fontSize: 16,
          fontWeight: 900,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InteractiveGlobe() {
  const [rotation, setRotation] = useState({ x: -16, y: 18 });
  const [dragging, setDragging] = useState(false);

  const dragState = useRef({
    startX: 0,
    startY: 0,
    baseX: -16,
    baseY: 18,
  });

  useEffect(() => {
    if (dragging) return;

    const timer = setInterval(() => {
      setRotation((prev) => ({ ...prev, y: prev.y + 0.18 }));
    }, 24);

    return () => clearInterval(timer);
  }, [dragging]);

  function startDrag(clientX: number, clientY: number) {
    dragState.current = {
      startX: clientX,
      startY: clientY,
      baseX: rotation.x,
      baseY: rotation.y,
    };
    setDragging(true);
  }

  function moveDrag(clientX: number, clientY: number) {
    if (!dragging) return;

    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;

    setRotation({
      x: clamp(dragState.current.baseX - dy * 0.18, -55, 55),
      y: dragState.current.baseY + dx * 0.22,
    });
  }

  function endDrag() {
    setDragging(false);
  }

  const projected = useMemo(() => {
    return projectPoints(ALL_GLOBE_POINTS, rotation.x, rotation.y, 150);
  }, [rotation]);

  const visiblePoints = projected.filter((p) => p.visible).sort((a, b) => a.z - b.z);

  return (
    <div
      onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
      onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) startDrag(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) moveDrag(t.clientX, t.clientY);
      }}
      onTouchEnd={endDrag}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 530,
        aspectRatio: "1 / 1",
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <style jsx>{`
        @keyframes terronOrbitSpin {
          0% {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          100% {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes terronOrbitReverse {
          0% {
            transform: translate(-50%, -50%) rotate(360deg);
          }
          100% {
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }

        @keyframes terronRingGlow {
          0%,
          100% {
            opacity: 0.68;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes terronScan {
          0% {
            transform: translateY(-8px);
            opacity: 0.22;
          }
          50% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(8px);
            opacity: 0.22;
          }
        }

        .terron-orbit-ring {
          animation: terronOrbitSpin 26s linear infinite;
        }

        .terron-orbit-ring-reverse {
          animation: terronOrbitReverse 36s linear infinite;
        }

        .terron-ring-glow {
          animation: terronRingGlow 3.2s ease-in-out infinite;
        }

        .terron-scan-line {
          animation: terronScan 4.5s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .terron-orbit-ring,
          .terron-orbit-ring-reverse,
          .terron-ring-glow,
          .terron-scan-line {
            animation: none !important;
          }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: "10% 10% 14% 10%",
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 50%, rgba(247,210,122,0.18), transparent 72%)",
          filter: "blur(24px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "8%",
          right: "8%",
          bottom: "4%",
          height: "12%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(247,210,122,0.22), rgba(247,210,122,0.02) 70%, transparent 85%)",
          filter: "blur(16px)",
          transform: "scaleX(0.92)",
          pointerEvents: "none",
        }}
      />

      <div
        className="terron-orbit-ring terron-ring-glow"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "94%",
          height: "94%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: "1px solid rgba(247,210,122,0.24)",
          boxShadow: "0 0 34px rgba(247,210,122,0.12)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "4.5%",
            left: "50%",
            width: 9,
            height: 9,
            marginLeft: -4.5,
            borderRadius: "50%",
            background: "#f7d27a",
            boxShadow: "0 0 16px rgba(247,210,122,0.78)",
          }}
        />
      </div>

      <div
        className="terron-orbit-ring-reverse"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "79%",
          height: "79%",
          transform: "translate(-50%, -50%) rotate(18deg)",
          borderRadius: "50%",
          border: "1px dashed rgba(247,210,122,0.16)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 34% 28%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.07) 14%, rgba(20,41,78,0.24) 28%, rgba(8,18,36,0.9) 60%, rgba(3,7,14,1) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "inset -34px -42px 94px rgba(0,0,0,0.52), inset 30px 20px 70px rgba(255,255,255,0.05), 0 32px 60px rgba(0,0,0,0.26)",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 400 400"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          <defs>
            <radialGradient id="globeCenterGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(255,215,120,0.18)" />
              <stop offset="100%" stopColor="rgba(255,215,120,0)" />
            </radialGradient>

            <linearGradient id="earthStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.20)" />
              <stop offset="100%" stopColor="rgba(247,210,122,0.18)" />
            </linearGradient>

            <linearGradient id="mapLineStrong" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(247,210,122,0.14)" />
            </linearGradient>

            <linearGradient id="networkStrong" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(247,210,122,0.04)" />
              <stop offset="50%" stopColor="rgba(247,210,122,0.34)" />
              <stop offset="100%" stopColor="rgba(247,210,122,0.04)" />
            </linearGradient>
          </defs>

          <circle cx="200" cy="200" r="198" fill="url(#globeCenterGlow)" />

          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const rx = 165;
            const ry = 165 - i * 20;
            return (
              <ellipse
                key={`lat-${i}`}
                cx="200"
                cy="200"
                rx={rx}
                ry={ry}
                fill="none"
                stroke={i === 3 ? "rgba(247,210,122,0.12)" : "rgba(247,210,122,0.08)"}
                strokeWidth={i === 3 ? "1.2" : "1"}
              />
            );
          })}

          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const scaleX = Math.abs(Math.cos(((i + 1) * Math.PI) / 8));
            return (
              <ellipse
                key={`lon-${i}`}
                cx="200"
                cy="200"
                rx={165 * scaleX}
                ry="165"
                fill="none"
                stroke={i === 2 || i === 4 ? "rgba(247,210,122,0.11)" : "rgba(247,210,122,0.07)"}
                strokeWidth={i === 2 || i === 4 ? "1.1" : "1"}
              />
            );
          })}

          <GlobeContinents rotationX={rotation.x} rotationY={rotation.y} />

          <circle
            cx="200"
            cy="200"
            r="164"
            fill="none"
            stroke="url(#mapLineStrong)"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity="0.62"
          />

          <path
            d="M70 170 C120 120, 180 130, 220 100 S320 80, 345 130"
            fill="none"
            stroke="rgba(255,255,255,0.11)"
            strokeWidth="1.1"
            opacity="0.62"
          />
          <path
            d="M75 230 C140 210, 180 235, 240 210 S305 185, 334 215"
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1.1"
            opacity="0.56"
          />
          <path
            d="M100 85 C155 115, 195 105, 250 125"
            fill="none"
            stroke="rgba(247,210,122,0.16)"
            strokeWidth="1.1"
            opacity="0.56"
          />
          <path
            d="M98 300 C152 270, 215 280, 288 248"
            fill="none"
            stroke="rgba(247,210,122,0.16)"
            strokeWidth="1.1"
            opacity="0.54"
          />

          {drawVisibleConnections(visiblePoints).map((line, i) => (
            <line
              key={`line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="url(#networkStrong)"
              strokeWidth={line.strong ? 1.4 : 1}
              strokeDasharray={line.strong ? "0" : "4 4"}
              opacity={line.strong ? 0.95 : 0.88}
            />
          ))}

          {visiblePoints.map((point, index) => {
            const pulseDelay = `${(index % 8) * 0.16}s`;
            const outerR = point.size >= 0.75 ? 7.2 * point.size : 5.4 * point.size;
            const innerR = point.size >= 0.75 ? 3.6 * point.size : 2.7 * point.size;
            const isMajor = point.size >= 0.8;

            return (
              <g key={point.id} transform={`translate(${point.x}, ${point.y})`}>
                <circle
                  className="terron-glow-dot"
                  r={outerR}
                  fill={isMajor ? "rgba(247,210,122,0.14)" : "rgba(247,210,122,0.09)"}
                  style={{ animationDelay: pulseDelay }}
                />
                <circle
                  className="terron-glow-dot"
                  r={innerR}
                  fill="#f7d27a"
                  style={{
                    animationDelay: pulseDelay,
                    filter: isMajor
                      ? "drop-shadow(0 0 12px rgba(247,210,122,0.78))"
                      : "drop-shadow(0 0 8px rgba(247,210,122,0.48))",
                  }}
                />
              </g>
            );
          })}

          <circle
            cx="200"
            cy="200"
            r="198"
            fill="none"
            stroke="url(#earthStroke)"
            strokeWidth="1.2"
          />

          <ellipse
            cx="130"
            cy="100"
            rx="66"
            ry="122"
            fill="rgba(255,255,255,0.05)"
            transform="rotate(-28 130 100)"
          />
        </svg>

        <div
          className="terron-scan-line"
          style={{
            position: "absolute",
            left: "10%",
            right: "10%",
            top: "48%",
            height: 2,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.0) 10%, rgba(247,210,122,0.48) 50%, rgba(247,210,122,0.0) 90%, transparent 100%)",
            filter: "blur(0.6px)",
            pointerEvents: "none",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "108%",
          height: "108%",
          borderRadius: "50%",
          border: "1px solid rgba(247,210,122,0.08)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 12,
          transform: "translateX(-50%)",
          padding: "8px 12px",
          borderRadius: 999,
          background: "rgba(247,210,122,0.08)",
          border: "1px solid rgba(247,210,122,0.16)",
          color: "#f4d58d",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.2,
          whiteSpace: "nowrap",
          backdropFilter: "blur(10px)",
        }}
      >
        TERRON GLOBAL NETWORK
      </div>
    </div>
  );
}

function GlobeContinents({
  rotationX,
  rotationY,
}: {
  rotationX: number;
  rotationY: number;
}) {
  const continentShapes = useMemo(
    () => [
      { id: "north-america", lat: 39, lon: -104, width: 72, height: 34, rot: -18 },
      { id: "greenland", lat: 72, lon: -40, width: 24, height: 12, rot: -10 },
      { id: "south-america", lat: -17, lon: -60, width: 34, height: 60, rot: 12 },
      { id: "europe", lat: 51, lon: 12, width: 30, height: 16, rot: -8 },
      { id: "africa", lat: 8, lon: 19, width: 40, height: 66, rot: 6 },
      { id: "middle-east", lat: 27, lon: 46, width: 22, height: 16, rot: 4 },
      { id: "asia-west", lat: 42, lon: 70, width: 54, height: 24, rot: 8 },
      { id: "asia-east", lat: 30, lon: 112, width: 68, height: 36, rot: 12 },
      { id: "india", lat: 22, lon: 79, width: 20, height: 26, rot: 8 },
      { id: "southeast-asia", lat: 8, lon: 104, width: 22, height: 20, rot: 18 },
      { id: "australia", lat: -25, lon: 134, width: 34, height: 22, rot: 8 },
    ],
    []
  );

  const projected = projectShapes(continentShapes, rotationX, rotationY, 150);

  return (
    <>
      {projected
        .filter((shape) => shape.visible)
        .sort((a, b) => a.z - b.z)
        .map((shape) => (
          <g key={shape.id}>
            <ellipse
              cx={shape.x}
              cy={shape.y}
              rx={shape.width}
              ry={shape.height}
              fill="rgba(198,214,235,0.14)"
              stroke="rgba(247,210,122,0.18)"
              strokeWidth="1"
              transform={`rotate(${shape.rot} ${shape.x} ${shape.y})`}
            />
            <ellipse
              cx={shape.x}
              cy={shape.y}
              rx={shape.width * 0.84}
              ry={shape.height * 0.84}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="0.9"
              transform={`rotate(${shape.rot} ${shape.x} ${shape.y})`}
            />
          </g>
        ))}
    </>
  );
}

function projectPoints(points: GlobePoint[], rotXDeg: number, rotYDeg: number, radius: number): ProjectedPoint[] {
  const rotX = degToRad(rotXDeg);
  const rotY = degToRad(rotYDeg);

  return points.map((point) => {
    const lat = degToRad(point.lat);
    const lon = degToRad(point.lon);

    let x = radius * Math.cos(lat) * Math.sin(lon);
    let y = radius * Math.sin(lat);
    let z = radius * Math.cos(lat) * Math.cos(lon);

    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
    x = x1;
    z = z1;

    const y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z * Math.cos(rotX);
    y = y1;
    z = z2;

    return {
      id: point.id,
      x: 200 + x,
      y: 200 - y,
      z,
      visible: z > -8,
      size: point.size ?? 1,
    };
  });
}

function projectShapes(
  shapes: { id: string; lat: number; lon: number; width: number; height: number; rot: number }[],
  rotXDeg: number,
  rotYDeg: number,
  radius: number
) {
  const rotX = degToRad(rotXDeg);
  const rotY = degToRad(rotYDeg);

  return shapes.map((shape) => {
    const lat = degToRad(shape.lat);
    const lon = degToRad(shape.lon);

    let x = radius * Math.cos(lat) * Math.sin(lon);
    let y = radius * Math.sin(lat);
    let z = radius * Math.cos(lat) * Math.cos(lon);

    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
    x = x1;
    z = z1;

    const y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z * Math.cos(rotX);
    y = y1;
    z = z2;

    const perspective = 0.78 + ((z + radius) / (2 * radius)) * 0.42;

    return {
      ...shape,
      x: 200 + x,
      y: 200 - y,
      z,
      visible: z > -28,
      width: shape.width * perspective,
      height: shape.height * perspective,
    };
  });
}

function drawVisibleConnections(points: ProjectedPoint[]) {
  const connections = [
    ["ny", "toronto", true],
    ["ny", "london", true],
    ["la", "tokyo", true],
    ["mexico", "bogota", false],
    ["bogota", "saopaulo", false],
    ["saopaulo", "buenosaires", false],

    ["london", "paris", false],
    ["paris", "berlin", false],
    ["london", "madrid", false],
    ["amsterdam", "stockholm", false],
    ["rome", "istanbul", false],

    ["london", "istanbul", true],
    ["berlin", "istanbul", true],
    ["istanbul", "ankara", false],
    ["istanbul", "izmir", false],
    ["istanbul", "dubai", true],
    ["dubai", "riyadh", false],
    ["dubai", "doha", false],
    ["tehran", "dubai", false],

    ["cairo", "istanbul", false],
    ["casablanca", "madrid", false],
    ["lagos", "london", false],
    ["lagos", "nairobi", false],
    ["nairobi", "johannesburg", false],

    ["dubai", "mumbai", true],
    ["mumbai", "delhi", false],
    ["delhi", "bangkok", false],
    ["bangkok", "singapore", true],
    ["singapore", "jakarta", false],
    ["hongkong", "shanghai", false],
    ["beijing", "seoul", false],
    ["seoul", "tokyo", true],
    ["shanghai", "tokyo", true],
    ["singapore", "sydney", true],
    ["sydney", "melbourne", false],
    ["melbourne", "auckland", false],
  ] as const;

  return connections
    .map(([a, b, strong]) => {
      const p1 = points.find((p) => p.id === a && p.visible);
      const p2 = points.find((p) => p.id === b && p.visible);
      if (!p1 || !p2) return null;
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, strong };
    })
    .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; strong: boolean }[];
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTryPair(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "…";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `₺${num.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUsd(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "…";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(247,210,122,0.18)",
  background: "linear-gradient(135deg, #f6e1a5 0%, #d4a64a 45%, #b8842b 100%)",
  color: "#09111f",
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 16px 30px rgba(212,166,74,0.24)",
  transition: "transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 0.18s ease, background 0.18s ease, border-color 0.18s ease",
};

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#cbd5e1",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};