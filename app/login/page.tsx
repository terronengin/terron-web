"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ViewMode = "login" | "register" | "forgot";

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

  const [displayUsers, setDisplayUsers] = useState(0);
  const targetUsers = 4;

  useEffect(() => {
    const remembered =
      typeof window !== "undefined" ? localStorage.getItem("terron_remember_me") : null;
    const savedEmail =
      typeof window !== "undefined" ? localStorage.getItem("terron_saved_email") : null;

    if (remembered !== null) {
      setRememberMe(remembered === "true");
    }

    if (savedEmail) {
      setLoginEmail(savedEmail);
    }

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/dashboard");
      }
    }

    checkSession();
  }, [router]);

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setDisplayUsers(current);
      if (current >= targetUsers) clearInterval(timer);
    }, 220);

    return () => clearInterval(timer);
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
        console.log("SIGN IN ERROR:", error);
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
        console.log("SIGN UP ERROR:", error);
        showMessage(error.message, true);
        return;
      }

      const userId = data.user?.id;

      if (userId) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: userId,
          full_name: fullName,
          username,
          email: registerEmail.trim(),
          city,
          district,
        });

        if (profileError) {
          console.log("PROFILE SAVE ERROR:", profileError);
        }
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
        console.log("RESET ERROR:", error);
        showMessage(error.message, true);
        return;
      }

      showMessage("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.");
    } finally {
      setLoading(false);
    }
  }

  const chartBars = useMemo(() => [36, 54, 41, 68, 57, 82, 73, 94], []);
  const tickerItems = useMemo(
    () => [
      { label: "İSTANBUL", value: "+12.4%" },
      { label: "ANKARA", value: "+8.1%" },
      { label: "İZMİR", value: "+9.7%" },
      { label: "ANTALYA", value: "+14.2%" },
      { label: "BURSA", value: "+7.8%" },
      { label: "KOCAELİ", value: "+10.5%" },
      { label: "MERSİN", value: "+11.3%" },
      { label: "MUĞLA", value: "+13.9%" },
    ],
    []
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(circle at top, #14284d 0%, #08152d 34%, #030712 72%, #01040a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <style jsx>{`
        @keyframes terronTicker {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes terronPulse {
          0%,
          100% {
            opacity: 0.75;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.04);
          }
        }

        .terron-ticker-track {
          display: flex;
          width: max-content;
          animation: terronTicker 22s linear infinite;
        }

        .terron-pulse {
          animation: terronPulse 2.6s ease-in-out infinite;
        }

        @media (max-width: 900px) {
          .terron-top-panels {
            display: none !important;
          }

          .terron-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
          }

          .terron-map-panel {
            min-height: 180px !important;
            order: 2;
          }

          .terron-copy-panel {
            order: 1;
          }
        }

        @media (max-width: 640px) {
          .terron-stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "44px 44px",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.22,
          background: `
            radial-gradient(circle at 18% 22%, rgba(255,215,120,0.16), transparent 18%),
            radial-gradient(circle at 78% 14%, rgba(234,29,36,0.14), transparent 16%),
            radial-gradient(circle at 70% 70%, rgba(255,215,120,0.09), transparent 20%),
            radial-gradient(circle at 28% 78%, rgba(255,255,255,0.05), transparent 18%)
          `,
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "12%",
          left: "8%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,215,120,0.12) 0%, rgba(255,215,120,0.02) 45%, transparent 72%)",
          filter: "blur(10px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: "8%",
          right: "7%",
          width: 340,
          height: 340,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(234,29,36,0.10) 0%, rgba(234,29,36,0.02) 45%, transparent 70%)",
          filter: "blur(18px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="terron-top-panels"
        style={{
          position: "absolute",
          top: 34,
          left: 34,
          right: 34,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 18,
            border: "1px solid rgba(255,215,120,0.18)",
            background: "rgba(7, 16, 34, 0.42)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
            maxWidth: 270,
          }}
        >
          <div
            style={{
              color: "#f7d27a",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.3,
              marginBottom: 8,
            }}
          >
            GLOBAL MARKET OVERVIEW
          </div>

          <div style={{ display: "flex", alignItems: "end", gap: 6, height: 76 }}>
            {chartBars.map((bar, i) => (
              <div
                key={i}
                style={{
                  width: 18,
                  height: `${bar}%`,
                  borderRadius: 999,
                  background:
                    i === chartBars.length - 1
                      ? "linear-gradient(180deg, #f7d27a 0%, #c89a38 100%)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(148,163,184,0.5) 100%)",
                  boxShadow:
                    i === chartBars.length - 1 ? "0 0 20px rgba(247,210,122,0.35)" : "none",
                }}
              />
            ))}
          </div>

          <div
            style={{
              marginTop: 10,
              color: "#94a3b8",
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            Dijital arsa yatırımı, veri destekli fiyat görünümü ve ölçeklenebilir işlem deneyimi.
          </div>
        </div>

        <div
          style={{
            padding: "12px 15px",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(7, 16, 34, 0.36)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.20)",
            minWidth: 152,
            textAlign: "right",
          }}
        >
          <div
            style={{
              color: "#64748b",
              fontSize: 10,
              letterSpacing: 1.2,
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            PLATFORM STATUS
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            TERRONTR.COM
          </div>
          <div
            className="terron-pulse"
            style={{
              marginTop: 6,
              color: "#86efac",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            System Online
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: mode === "register" ? 980 : 1040,
          background: "linear-gradient(180deg, rgba(5,12,24,0.82) 0%, rgba(6,17,39,0.90) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 30,
          padding: mode === "register" ? 34 : 32,
          boxShadow: "0 30px 80px rgba(0,0,0,0.46)",
          backdropFilter: "blur(16px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 28,
            right: 28,
            height: 1,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.7) 25%, rgba(247,210,122,0.95) 50%, rgba(247,210,122,0.7) 75%, transparent 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at top, rgba(247,210,122,0.08) 0%, transparent 24%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            overflow: "hidden",
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.025)",
            marginBottom: 22,
          }}
        >
          <div className="terron-ticker-track">
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#f7d27a",
                    boxShadow: "0 0 14px rgba(247,210,122,0.55)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "#e2e8f0",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    color: "#86efac",
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

        <div
          className="terron-hero-grid"
          style={{
            display: "grid",
            gridTemplateColumns: mode === "register" ? "1fr" : "1.02fr 0.98fr",
            gap: 28,
            alignItems: "stretch",
          }}
        >
          {mode !== "register" && (
            <div
              className="terron-map-panel"
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
                minHeight: 560,
                border: "1px solid rgba(255,255,255,0.07)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.02) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)
                  `,
                  backgroundSize: "28px 28px",
                  opacity: 0.3,
                }}
              />

              <div
                style={{
                  position: "absolute",
                  top: 18,
                  left: 18,
                  right: 18,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#f7d27a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 1.2,
                    }}
                  >
                    GLOBAL ACCESS MAP
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#cbd5e1",
                      fontSize: 13,
                      lineHeight: 1.5,
                      maxWidth: 260,
                    }}
                  >
                    Şeffaf fiyatlama, dijital metrekare alımı ve çok bölgeli yatırım erişimi.
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "rgba(247,210,122,0.08)",
                    border: "1px solid rgba(247,210,122,0.18)",
                    color: "#f5deb0",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.8,
                    whiteSpace: "nowrap",
                  }}
                >
                  TERRONTR.COM
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "80px 28px 72px",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    opacity: 0.95,
                    position: "relative",
                  }}
                >
                  <WorldMapSilhouette />

                  <MapPulse top="29%" left="19%" />
                  <MapPulse top="34%" left="43%" />
                  <MapPulse top="38%" left="50%" />
                  <MapPulse top="48%" left="76%" />
                  <MapPulse top="59%" left="33%" />
                  <MapPulse top="67%" left="81%" />

                  <ConnectionLine
                    x1="20%"
                    y1="30%"
                    x2="44%"
                    y2="34%"
                  />
                  <ConnectionLine
                    x1="44%"
                    y1="34%"
                    x2="50%"
                    y2="38%"
                  />
                  <ConnectionLine
                    x1="50%"
                    y1="38%"
                    x2="76%"
                    y2="48%"
                  />
                  <ConnectionLine
                    x1="44%"
                    y1="34%"
                    x2="33%"
                    y2="59%"
                  />
                  <ConnectionLine
                    x1="76%"
                    y1="48%"
                    x2="81%"
                    y2="67%"
                  />
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 18,
                  right: 18,
                  bottom: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <MiniMetric label="Aktif Bölge" value="12" />
                <MiniMetric label="Veri Katmanı" value="CANLI" highlight />
                <MiniMetric label="Min Yatırım" value="1 m²" />
              </div>
            </div>
          )}

          <div className="terron-copy-panel">
            <div style={{ textAlign: "center", marginBottom: 28, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: "linear-gradient(135deg, #ea1d24 0%, #a60f14 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: 36,
                    fontWeight: 800,
                    boxShadow: "0 18px 34px rgba(234, 29, 36, 0.28)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    flexShrink: 0,
                  }}
                >
                  T
                </div>

                <div style={{ textAlign: "left" }}>
                  <div
                    style={{
                      color: "#ffffff",
                      fontSize: 42,
                      fontWeight: 900,
                      letterSpacing: 0.8,
                      lineHeight: 1,
                    }}
                  >
                    TERRON
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      color: "#f7d27a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 2.2,
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
                  padding: "8px 14px",
                  marginBottom: 16,
                  borderRadius: 999,
                  border: "1px solid rgba(247,215,122,0.18)",
                  background: "rgba(247,215,122,0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    color: "#f4e3b2",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1.4,
                  }}
                >
                  DİJİTAL YATIRIM PLATFORMU
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  color: "#cbd5e1",
                  fontSize: 15,
                  lineHeight: 1.8,
                  maxWidth: 430,
                  marginInline: "auto",
                }}
              >
                Metrekare bazlı dijital erişim, şeffaf fiyatlama ve ölçeklenebilir yatırım deneyimi tek platformda.
              </p>

              <div
                className="terron-stats-grid"
                style={{
                  marginTop: 22,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <StatCard label="Toplam Kullanıcı" value={String(displayUsers)} highlight />
                <StatCard label="Aktif Bölge" value="12" />
                <StatCard label="Başlangıç" value="1 m²" />
              </div>
            </div>

            {mode === "login" && (
              <div style={{ display: "grid", gap: 14, position: "relative", zIndex: 1 }}>
                <Field label="E-posta">
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Şifre">
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
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
              <div style={{ display: "grid", gap: 14, position: "relative", zIndex: 1 }}>
                <Field label="Kayıtlı e-posta">
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
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
              <div style={{ display: "grid", gap: 18, position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <Field label="İsim Soyisim *">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Kullanıcı Adı *">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="E-posta *">
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Şifre *">
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Şifre Tekrar *">
                    <input
                      type="password"
                      value={registerPasswordConfirm}
                      onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="İl">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="İlçe">
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
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
                  marginTop: 18,
                  borderRadius: 16,
                  padding: "13px 14px",
                  background: isError ? "rgba(239, 68, 68, 0.10)" : "rgba(34, 197, 94, 0.10)",
                  border: isError
                    ? "1px solid rgba(239, 68, 68, 0.22)"
                    : "1px solid rgba(34, 197, 94, 0.22)",
                  color: isError ? "#fca5a5" : "#86efac",
                  fontSize: 14,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {msg}
              </div>
            )}

            <div
              style={{
                marginTop: 24,
                textAlign: "center",
                color: "#64748b",
                fontSize: 12,
                letterSpacing: 0.5,
                position: "relative",
                zIndex: 1,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 8,
          color: "#cbd5e1",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function StatCard({
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
        padding: "12px 12px",
        borderRadius: 18,
        background: highlight
          ? "linear-gradient(180deg, rgba(247,210,122,0.12) 0%, rgba(247,210,122,0.05) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
        border: highlight
          ? "1px solid rgba(247,210,122,0.20)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
      }}
    >
      <div
        style={{
          color: highlight ? "#f4d58d" : "#94a3b8",
          fontSize: 11,
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#ffffff",
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
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
        padding: "10px 10px",
        borderRadius: 16,
        background: highlight ? "rgba(247,210,122,0.08)" : "rgba(255,255,255,0.04)",
        border: highlight
          ? "1px solid rgba(247,210,122,0.18)"
          : "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          color: highlight ? "#f4d58d" : "#94a3b8",
          fontSize: 10,
          fontWeight: 800,
          marginBottom: 5,
          letterSpacing: 0.7,
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

function MapPulse({ top, left }: { top: string; left: string }) {
  return (
    <div
      className="terron-pulse"
      style={{
        position: "absolute",
        top,
        left,
        width: 12,
        height: 12,
        marginLeft: -6,
        marginTop: -6,
        borderRadius: "50%",
        background: "#f7d27a",
        boxShadow: "0 0 0 6px rgba(247,210,122,0.12), 0 0 18px rgba(247,210,122,0.55)",
      }}
    />
  );
}

function ConnectionLine({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <line
        x1={parseFloat(x1)}
        y1={parseFloat(y1)}
        x2={parseFloat(x2)}
        y2={parseFloat(y2)}
        stroke="rgba(247,210,122,0.34)"
        strokeWidth="0.35"
        strokeDasharray="1.6 1.2"
      />
    </svg>
  );
}

function WorldMapSilhouette() {
  return (
    <svg
      viewBox="0 0 900 430"
      style={{ width: "100%", height: "auto", display: "block" }}
      fill="none"
    >
      <defs>
        <linearGradient id="mapGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(247,210,122,0.40)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.10)" />
        </linearGradient>
      </defs>

      <g opacity="0.9">
        <path
          d="M76 145c18-14 37-18 58-17 13 1 24-4 35-10 12-6 24-9 39-8 17 1 28 8 42 16 15 9 34 14 50 20 15 6 17 15 9 27-6 10-16 16-26 22-16 10-16 16-1 28 16 13 19 27 7 45-10 15-25 23-44 26-13 2-24-1-34-8-15-10-29-12-47-9-29 5-55-4-74-27-8-9-11-20-10-32 2-18-4-31-16-45-17-20-14-22 12-28z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
        <path
          d="M308 101c18-8 37-10 56-3 11 4 21 5 33 4 19-2 35 5 49 17 17 15 38 24 57 36 11 7 12 18 2 28-11 12-25 15-41 13-18-2-32 5-46 14-19 11-39 18-62 14-24-4-42-16-55-36-9-13-12-28-9-44 3-14 2-28 16-36z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
        <path
          d="M428 206c16-11 34-13 53-8 18 5 30-5 44-11 26-11 51-10 75 5 20 13 39 27 58 41 15 11 28 11 42-1 11-9 24-11 38-8 19 5 37 11 52 24 14 13 16 24 3 39-15 18-34 26-57 26-14 0-27 4-39 11-17 10-34 16-55 14-26-2-47-14-64-33-15-17-31-24-53-27-34-4-61-22-82-49-10-13-10-16-2-23 8-7 17-13 27-20z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
        <path
          d="M666 122c16-9 32-10 49-6 18 4 33 13 46 26 11 11 24 17 40 19 14 2 25 9 35 19 13 13 13 25-1 37-17 14-37 18-58 18-16 0-31 2-46 6-13 4-24 0-32-11-11-14-23-28-34-42-8-10-8-20 0-30z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
        <path
          d="M322 302c13-12 29-17 47-17 22 0 40 9 55 25 14 15 16 31 6 49-10 17-24 31-43 39-14 6-27 4-39-5-9-8-16-18-21-29-7-15-17-27-24-41-5-8-2-15 4-21 4-3 9-6 15-9z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
        <path
          d="M768 292c14-9 29-10 44-3 12 6 20 15 24 27 7 18-6 44-24 50-17 6-31-1-42-14-12-14-18-30-19-48 0-5 5-9 17-12z"
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(247,210,122,0.18)"
        />
      </g>
    </svg>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  color: "#ffffff",
  outline: "none",
  fontSize: 15,
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: 16,
  border: "1px solid rgba(247,210,122,0.18)",
  background: "linear-gradient(135deg, #f6e1a5 0%, #d4a64a 45%, #b8842b 100%)",
  color: "#09111f",
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 16px 30px rgba(212,166,74,0.24)",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#cbd5e1",
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};