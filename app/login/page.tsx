"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    try {
      setLoading(true);
      setMsg(null);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
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

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("Kayıt başarılı. Şimdi giriş yapabilirsiniz.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #1f2937 0%, #0f172a 35%, #020617 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: "rgba(15, 23, 42, 0.82)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 18px",
              borderRadius: 18,
              background: "linear-gradient(135deg, #ffffff 0%, #d1d5db 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            T
          </div>

          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 0.3,
            }}
          >
            Terron
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              color: "#94a3b8",
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            Gayrimenkul yatırım platformuna güvenli giriş yapın.
          </p>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
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
              E-posta
            </label>
            <input
              type="email"
              placeholder="ornek@terron.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "#ffffff",
                outline: "none",
                fontSize: 15,
                boxSizing: "border-box",
              }}
            />
          </div>

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
              Şifre
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                color: "#ffffff",
                outline: "none",
                fontSize: 15,
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={signIn}
            disabled={loading}
            style={{
              marginTop: 6,
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)",
              color: "#0f172a",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "Bekleyin..." : "Giriş Yap"}
          </button>

          <button
            onClick={signUp}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loading ? "Bekleyin..." : "Kayıt Ol"}
          </button>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              padding: "12px 14px",
              background: "rgba(239, 68, 68, 0.10)",
              border: "1px solid rgba(239, 68, 68, 0.22)",
              color: "#fca5a5",
              fontSize: 14,
              lineHeight: 1.5,
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
            lineHeight: 1.6,
          }}
        >
          Terron • Profesyonel gayrimenkul yatırım deneyimi
        </div>
      </div>
    </div>
  );
}