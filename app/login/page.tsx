"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const remembered = typeof window !== "undefined" ? localStorage.getItem("terron_remember_me") : null;
    const savedEmail = typeof window !== "undefined" ? localStorage.getItem("terron_saved_email") : null;

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

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #132344 0%, #07152e 38%, #020617 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: mode === "register" ? 720 : 470,
          background: "rgba(6, 17, 39, 0.88)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 28,
          padding: mode === "register" ? 34 : 32,
          boxShadow: "0 25px 70px rgba(0,0,0,0.42)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
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
                width: 68,
                height: 68,
                borderRadius: 18,
                background: "#ea1d24",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: 34,
                fontWeight: 800,
              }}
            >
              T
            </div>
            <div
              style={{
                color: "#ffffff",
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: 0.5,
              }}
            >
              TERRON
            </div>
          </div>

          <p
            style={{
              margin: 0,
              color: "#94a3b8",
              fontSize: 15,
              lineHeight: 1.7,
            }}
          >
            Gayrimenkul yatırım platformuna güvenli ve profesyonel erişim.
          </p>
        </div>

        {mode === "login" && (
          <div style={{ display: "grid", gap: 14 }}>
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
          <div style={{ display: "grid", gap: 14 }}>
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
          <div style={{ display: "grid", gap: 18 }}>
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
          }}
        >
          TERRON • Profesyonel gayrimenkul yatırım deneyimi
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
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
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
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: 16,
  border: "none",
  background: "linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)",
  color: "#081226",
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "15px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
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
