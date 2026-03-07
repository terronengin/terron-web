"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function signIn() {
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
  }

  async function signUp() {
    setMsg(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Kayıt tamam ✅ Şimdi giriş yap.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto" }}>
      <h2>Terron Giriş</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8, width: "100%" }}
      />

      <input
        type="password"
        placeholder="Şifre"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8, width: "100%" }}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={signIn} style={{ marginRight: 10 }}>
          Giriş Yap
        </button>

        <button onClick={signUp}>
          Kayıt Ol
        </button>
      </div>

      {msg && (
        <p style={{ marginTop: 15, color: "red" }}>
          {msg}
        </p>
      )}
    </div>
  );
}