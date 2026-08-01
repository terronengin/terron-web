"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "../../lib/supabaseClient";
import { DEFAULT_DISPLAY_USER_COUNT } from "@/lib/site/displayUserCount";

const TerronHeroGlobe = dynamic(() => import("../components/login/TerronHeroGlobe"), {
  ssr: false,
});

type ViewMode = "login" | "register" | "forgot";
 
type MarketResponse = {
  usdtry?: string | number | null;
  eurtry?: string | number | null; 
  gbptry?: string | number | null;
  USDTRY?: string | number | null;
  EURTRY?: string | number | null;
  GBPTRY?: string | number | null;
  BTC?: number | null;
  ETH?: number | null;
  error?: string;
};

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
  const [displayUserCount, setDisplayUserCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/public/display-user-count", { cache: "no-store" });
        const j = (await res.json()) as { ok?: boolean; value?: unknown };
        if (!mounted) return;
        if (j?.ok && typeof j.value === "number" && Number.isFinite(j.value)) {
          setDisplayUserCount(Math.max(0, Math.floor(j.value)));
        } else {
          setDisplayUserCount(DEFAULT_DISPLAY_USER_COUNT);
        }
      } catch {
        if (mounted) setDisplayUserCount(DEFAULT_DISPLAY_USER_COUNT);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
        // ignore
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
      { label: "LONDON", value: "+6.9%", positive: true },
      { label: "DUBAI", value: "+11.8%", positive: true },
      { label: "SINGAPORE", value: "+5.7%", positive: true },
      { label: "TOKYO", value: "+4.6%", positive: true },
      { label: "NEW YORK", value: "+7.2%", positive: true },
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

    const usdValue = marketData.usdtry ?? marketData.USDTRY;
    const eurValue = marketData.eurtry ?? marketData.EURTRY;
    const gbpValue = marketData.gbptry ?? marketData.GBPTRY;

    return [
      { label: "USD/TRY", value: formatTryPair(usdValue), positive: true },
      { label: "EUR/TRY", value: formatTryPair(eurValue), positive: true },
      { label: "GBP/TRY", value: formatTryPair(gbpValue), positive: true },
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
        background: `
          radial-gradient(circle at 50% 6%, rgba(116,146,255,0.12) 0%, rgba(116,146,255,0.05) 14%, transparent 28%),
          radial-gradient(circle at 18% 12%, rgba(255,223,163,0.08) 0%, transparent 18%),
          radial-gradient(circle at 80% 18%, rgba(100,132,240,0.10) 0%, transparent 20%),
          radial-gradient(circle at 50% 54%, rgba(255,236,188,0.04) 0%, transparent 24%),
          linear-gradient(180deg, #030914 0%, #020610 36%, #01040a 100%)
        `,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px",
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
          background: #01040a;
        }

        input::placeholder {
          color: rgba(226, 232, 240, 0.4);
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        textarea:-webkit-autofill,
        select:-webkit-autofill {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0px 1000px rgba(7, 12, 22, 0.74) inset;
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

        .terron-ticker-shell {
          overflow: hidden;
          width: 100%;
        }

        .terron-ticker-track {
          display: flex;
          width: max-content;
          min-width: max-content;
          animation: terronTicker 30s linear infinite;
          will-change: transform;
        }

        .terron-ticker-track-reverse {
          display: flex;
          width: max-content;
          min-width: max-content;
          animation: terronTickerReverse 34s linear infinite;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .terron-ticker-track,
          .terron-ticker-track-reverse {
            animation: none !important;
          }
        }

        @media (max-width: 980px) {
          .terron-main-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .terron-globe-col {
            min-height: 260px !important;
          }
        }

        @media (max-width: 640px) {
          .terron-shell {
            border-radius: 22px !important;
            padding: 10px !important;
          }

          .terron-globe-col {
            min-height: 260px !important;
          }

          .terron-glass-input {
            min-height: 48px !important;
            padding: 0 12px !important;
          }

          .terron-glass-input input {
            font-size: 14px !important;
          }

          .terron-main-action {
            min-height: 44px !important;
            font-size: 14px !important;
          }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(circle at 16% 18%, rgba(255,220,145,0.07), transparent 16%),
            radial-gradient(circle at 84% 12%, rgba(124,150,255,0.08), transparent 18%),
            radial-gradient(circle at 70% 72%, rgba(255,223,163,0.05), transparent 20%)
          `,
        }}
      />

      <div
        className="terron-shell"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: isRegister ? 1040 : 1220,
          borderRadius: 26,
          padding: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(5, 10, 20, 0.30)",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.04)",
          backdropFilter: "blur(14px)",
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
              "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.0) 10%, rgba(247,210,122,0.6) 50%, rgba(247,210,122,0.0) 90%, transparent 100%)",
          }}
        />

        <TickerBar
          items={financeTickerItems}
          title="GLOBAL MARKET FEED"
          reverse={false}
          accent="#f2c96c"
        />

        <div style={{ height: 6 }} />

        <TickerBar
          items={cityTickerItems}
          title="CITY PERFORMANCE BELT"
          reverse
          accent="#c8d8f2"
        />

        <div
          className="terron-main-grid"
          style={{
            display: "grid",
            gridTemplateColumns: isRegister ? "1fr" : "0.95fr 1.05fr",
            gap: 14,
            alignItems: "stretch",
            marginTop: 12,
          }}
        >
          <div className="terron-form-col" style={{ position: "relative", zIndex: 2 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  className="terron-title"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)",
                    color: "#f7f3e8",
                    fontSize: 18,
                    lineHeight: 1,
                    fontWeight: 900,
                    letterSpacing: 0.8,
                  }}
                >
                  TERRON
                </span>
                <span
                  className="terron-civil"
                  style={{
                    color: "rgba(246, 229, 190, 0.68)",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 2.4,
                  }}
                >
                  CIVIL · DIGITAL LAND INVESTMENT
                </span>
              </div>

              <div
                className="terron-user-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(247,210,122,0.14)",
                  background: "rgba(247,210,122,0.05)",
                }}
              >
                <span
                  style={{
                    color: "rgba(240, 210, 138, 0.8)",
                    fontSize: 8.5,
                    fontWeight: 800,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                  }}
                >
                  Toplam Kullanıcı
                </span>
                <span
                  className="terron-user-badge-value"
                  style={{ color: "#ffffff", fontSize: 13.5, fontWeight: 900 }}
                >
                  {(displayUserCount ?? DEFAULT_DISPLAY_USER_COUNT).toLocaleString("tr-TR")}
                </span>
              </div>
            </div>

            <div
              style={{
                borderRadius: 24,
                padding: 22,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(8, 14, 26, 0.42)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.04), 0 16px 30px rgba(0,0,0,0.16)",
                backdropFilter: "blur(14px)",
              }}
            >
              <h1
                style={{
                  margin: "0 0 5px",
                  fontSize: 25,
                  fontWeight: 900,
                  color: "#ffffff",
                  letterSpacing: -0.2,
                }}
              >
                {mode === "login" ? "Giriş Yap" : mode === "register" ? "Üyelik Oluştur" : "Şifre Sıfırlama"}
              </h1>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: 12.5,
                  color: "rgba(200,208,222,0.62)",
                  lineHeight: 1.5,
                }}
              >
                {mode === "login"
                  ? "Hesabınıza erişmek için bilgilerinizi girin."
                  : mode === "register"
                    ? "Türkiye'nin dijital arsa yatırım platformuna katılın."
                    : "E-posta adresinize sıfırlama bağlantısı gönderelim."}
              </p>

              {mode === "login" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <GlassInput
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    icon="✉"
                  />

                  <GlassInput
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    icon="●"
                  />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "rgba(234, 213, 164, 0.92)",
                        fontSize: 13,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: "#d8a94d", cursor: "pointer" }}
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

                  <button
                    className="terron-main-action"
                    onClick={signIn}
                    disabled={loading}
                    style={primaryButtonStyle}
                  >
                    {loading ? "Bekleyin..." : "Giriş Yap"}
                  </button>

                  <div style={{ textAlign: "center", fontSize: 13, color: "rgba(200,208,222,0.62)" }}>
                    Hesabınız yok mu?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("register");
                        setMsg(null);
                      }}
                      disabled={loading}
                      style={{ ...linkButtonStyle, fontSize: 13, fontWeight: 800 }}
                    >
                      Üyelik oluşturun
                    </button>
                  </div>
                </div>
              )}

              {mode === "forgot" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <GlassInput
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="ornek@eposta.com"
                    icon="✉"
                  />

                  <button onClick={resetPassword} disabled={loading} style={primaryButtonStyle}>
                    {loading ? "Gönderiliyor..." : "Şifre Sıfırlama Linki Gönder"}
                  </button>

                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setMsg(null);
                      }}
                      style={{ ...linkButtonStyle, fontSize: 13, fontWeight: 800 }}
                    >
                      ← Girişe dön
                    </button>
                  </div>
                </div>
              )}

              {mode === "register" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div
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

                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setMsg(null);
                      }}
                      style={{ ...linkButtonStyle, fontSize: 13, fontWeight: 800 }}
                    >
                      ← Giriş ekranına dön
                    </button>
                  </div>
                </div>
              )}

              {msg && (
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: isError ? "rgba(239, 68, 68, 0.10)" : "rgba(34, 197, 94, 0.10)",
                    border: isError
                      ? "1px solid rgba(239, 68, 68, 0.18)"
                      : "1px solid rgba(34, 197, 94, 0.18)",
                    color: isError ? "#fca5a5" : "#86efac",
                    fontSize: 13,
                  }}
                >
                  {msg}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  color: "rgba(180,190,205,0.5)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                🔒 Verileriniz 256-bit SSL ile şifrelenir · KVKK uyumlu
              </div>
            </div>
          </div>

          {!isRegister && (
            <div
              className="terron-globe-col"
              style={{
                position: "relative",
                minHeight: 500,
                borderRadius: 24,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.05)",
                background: "rgba(255,255,255,0.02)",
                backdropFilter: "blur(6px)",
              }}
            >
              <TerronHeroGlobe />
            </div>
          )}
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
        overflow: "hidden",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(9, 15, 28, 0.34)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 28,
          padding: "7px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 14px ${accent}66`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: "#eef3fb",
            fontSize: 10.5,
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
                gap: 8,
                minHeight: 32,
                padding: "7px 12px",
                borderRight: "1px solid rgba(255,255,255,0.05)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: accent,
                  boxShadow: `0 0 12px ${accent}55`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "#f6f8fc",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  color: item.positive ? "#9bf2b7" : "#fda4af",
                  fontSize: 11,
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
          marginBottom: 7,
          color: "rgba(215, 222, 236, 0.94)",
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

function GlassInput({
  type,
  value,
  onChange,
  placeholder,
  icon,
}: {
  type: string;
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder: string;
  icon: string;
}) {
  return (
    <div
      className="terron-glass-input"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderRadius: 18,
        padding: "0 14px",
        minHeight: 54,
        background: "rgba(11, 19, 34, 0.44)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 22px rgba(0,0,0,0.14)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#efcc82",
          border: "1px solid rgba(247,210,122,0.16)",
          background: "rgba(247,210,122,0.06)",
          fontWeight: 800,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "#ffffff",
          fontSize: 15,
          fontWeight: 500,
        }}
      />
    </div>
  );
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
  padding: "11px 13px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "12px 16px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #F3D68A 0%, #C9962F 100%)",
  color: "#12161f",
  fontSize: 15.5,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 20px rgba(201,150,47,0.26)",
};

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#ead3a0",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};