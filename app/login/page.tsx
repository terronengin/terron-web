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
      if (current >= targetUsers) {
        clearInterval(timer);
      }
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

  const chartBars = useMemo(
    () => [36, 54, 41, 68, 57, 82, 73, 94],
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
          background: "radial-gradient(circle, rgba(255,215,120,0.12) 0%, rgba(255,215,120,0.02) 45%, transparent 72%)",
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
          background: "radial-gradient(circle, rgba(234,29,36,0.10) 0%, rgba(234,29,36,0.02) 45%, transparent 70%)",
          filter: "blur(18px)",
          pointerEvents: "none",
        }}
      />

      <div
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
                    i === chartBars.length - 1
                      ? "0 0 20px rgba(247,210,122,0.35)"
                      : "none",
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
          maxWidth: mode === "register" ? 760 : 500,
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
            background: "linear-gradient(90deg, transparent 0%, rgba(247,210,122,0.7) 25%, rgba(247,210,122,0.95) 50%, rgba(247,210,122,0.7) 75%, transparent 100%)",
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