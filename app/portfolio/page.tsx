"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type PositionProperty = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  expected_annual_return: number | null;
  risk_score: number | null;
  development_score: number | null;
  last_30d_change: number | null;
};

type PositionRow = {
  id: string;
  user_id: string;
  property_id: string;
  amount: number;
  units: number | null;
  entry_price: number | null;
  created_at: string;
  property?: PositionProperty | null;
};

type EnrichedPositionRow = PositionRow & {
  _entry: number;
  _units: number;
  _currentPrice: number;
  _currentValue: number;
  _pnl: number;
  _pnlPct: number;
};

export default function PortfolioPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      setLoadingSession(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const user = session?.user ?? null;
      setEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function hash01(str: string) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const u = h >>> 0;
    return u / 4294967296;
  }

  function simulatePrice(propertyId: string, annualReturnPct: number, basePrice = 100) {
    const t = todayISO();
    const noise = (hash01(`${propertyId}:${t}`) - 0.5) * 0.04;
    const driftDaily = Math.pow(1 + annualReturnPct / 100, 1 / 365) - 1;

    const epoch = new Date("2026-01-01T00:00:00");
    const now = new Date();
    const days = Math.max(0, Math.floor((now.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24)));

    const drift = Math.pow(1 + driftDaily, days);
    const price = basePrice * drift * (1 + noise);

    return Math.max(1, price);
  }

  async function ensureAndLoadWallet(currentUserId: string) {
    const { data: w, error: wErr } = await supabase
      .from("wallets")
      .select("user_id,balance")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (wErr) {
      console.error("[wallet] load error:", wErr);
      return;
    }

    if (w?.balance != null) {
      setWalletBalance(Number(w.balance));
      return;
    }

    const { data: ins, error: insErr } = await supabase
      .from("wallets")
      .insert({ user_id: currentUserId, balance: 1000000 })
      .select("balance")
      .single();

    if (insErr) {
      console.error("[wallet] insert error:", insErr);
      return;
    }

    setWalletBalance(Number(ins.balance));
  }

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      await ensureAndLoadWallet(userId);

      const { data, error } = await supabase
        .from("positions")
        .select(
          `
          id,
          user_id,
          property_id,
          amount,
          units,
          entry_price,
          created_at,
          property:properties (
            id,
            title,
            city,
            district,
            expected_annual_return,
            risk_score,
            development_score,
            last_30d_change
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[portfolio] load error:", error);
        setErrorMsg(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const normalizedRows: PositionRow[] = ((data ?? []) as any[]).map((row) => ({
        ...row,
        property: Array.isArray(row.property) ? row.property[0] ?? null : row.property ?? null,
      }));

      setRows(normalizedRows);
      setLoading(false);
    };

    load();
  }, [userId]);

  const enriched = useMemo<EnrichedPositionRow[]>(() => {
    return rows.map((r) => {
      const annual = Number(r.property?.expected_annual_return ?? 0);
      const entry = Number(r.entry_price ?? 100);
      const units = r.units != null ? Number(r.units) : Number(r.amount) / Math.max(1, entry);

      const currentPrice = simulatePrice(r.property_id, annual, 100);
      const currentValue = units * currentPrice;
      const pnl = currentValue - Number(r.amount);
      const pnlPct = Number(r.amount) > 0 ? (pnl / Number(r.amount)) * 100 : 0;

      return {
        ...r,
        _entry: entry,
        _units: units,
        _currentPrice: currentPrice,
        _currentValue: currentValue,
        _pnl: pnl,
        _pnlPct: pnlPct,
      };
    });
  }, [rows]);

  const summary = useMemo(() => {
    const count = enriched.length;
    const totalInvested = enriched.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
    const totalValue = enriched.reduce((acc, r) => acc + (Number(r._currentValue) || 0), 0);
    const pnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    return { count, totalInvested, totalValue, pnl, pnlPct };
  }, [enriched]);

  async function handleSell(row: EnrichedPositionRow) {
    if (sellingId) return;
    if (!userId) {
      alert("Kullanıcı bulunamadı.");
      return;
    }

    const sellAmount = Math.round(Number(row._currentValue || 0));

    if (!Number.isFinite(sellAmount) || sellAmount <= 0) {
      alert("Satış tutarı hesaplanamadı.");
      return;
    }

    const ok = window.confirm(
      `${row.property?.title ?? "Bu pozisyon"} satılsın mı?\n\nSatış Tutarı: ${formatNumber(
        sellAmount
      )} Çip`
    );

    if (!ok) return;

    setSellingId(row.id);

    const prevRows = rows;
    const prevWallet = walletBalance;

    setRows((prev) => prev.filter((x) => x.id !== row.id));
    setWalletBalance((prev) => Math.round(Number(prev ?? 0) + sellAmount));

    try {
      const { data: walletRow, error: walletErr } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletErr) throw walletErr;

      const dbBalance = Math.round(Number(walletRow?.balance ?? 0));
      const nextBalance = Math.round(dbBalance + sellAmount);

      const { error: walletUpdateErr } = await supabase
        .from("wallets")
        .update({
          balance: nextBalance,
        })
        .eq("user_id", userId);

      if (walletUpdateErr) throw walletUpdateErr;

      const { error: deleteErr } = await supabase
        .from("positions")
        .delete()
        .eq("id", row.id)
        .eq("user_id", userId);

      if (deleteErr) {
        await supabase
          .from("wallets")
          .update({
            balance: dbBalance,
          })
          .eq("user_id", userId);

        throw deleteErr;
      }

      alert("Pozisyon satıldı ✅ Çip yüklendi.");
    } catch (err: any) {
      console.error("[SELL] error:", err);
      setRows(prevRows);
      setWalletBalance(prevWallet);
      alert("Satış sırasında hata oluştu: " + (err?.message ?? String(err)));
    } finally {
      setSellingId(null);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loadingSession) return <div style={{ padding: 24 }}>Yükleniyor...</div>;

  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Terron • Portföy</h1>
        <p>Giriş yapılmamış.</p>
        <button onClick={() => router.replace("/login")}>Giriş sayfasına git</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1220", color: "white" }}>
      <div style={topbar}>
        <button onClick={() => router.push("/dashboard")} style={btnGhost}>
          ← Dashboard
        </button>

        <div style={{ fontWeight: 900, letterSpacing: 0.4 }}>Portföy</div>

        <div style={{ flex: 1 }} />

        <div style={pill}>🧾 Pozisyon: {summary.count}</div>
        <div style={pill}>🪙 Bakiye: {walletBalance == null ? "—" : `${formatNumber(walletBalance)} Çip`}</div>
        <div style={pill}>💼 Değer: {formatNumber(Math.round(summary.totalValue))} Çip</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>{email}</div>

        <button onClick={logout} style={btnDanger}>
          Çıkış
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <div style={card}>
            <div style={label}>Toplam Yatırım</div>
            <div style={value}>{formatNumber(Math.round(summary.totalInvested))} Çip</div>
          </div>
          <div style={card}>
            <div style={label}>Güncel Değer</div>
            <div style={value}>{formatNumber(Math.round(summary.totalValue))} Çip</div>
          </div>
          <div style={card}>
            <div style={label}>Kâr / Zarar</div>
            <div style={value}>{formatSigned(summary.pnl)} Çip</div>
          </div>
          <div style={card}>
            <div style={label}>% PnL</div>
            <div style={value}>{summary.pnlPct.toFixed(2)}%</div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {errorMsg && (
          <div style={{ ...card, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" }}>
            <div style={{ fontWeight: 800 }}>Hata</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{errorMsg}</div>
          </div>
        )}

        {loading ? (
          <div style={{ ...card, marginTop: 12, padding: 14 }}>Yükleniyor…</div>
        ) : (
          <div style={{ ...card, marginTop: 12, overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.08)", fontWeight: 900 }}>
              Pozisyonlarım (Simülasyon)
            </div>

            {enriched.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.8 }}>Henüz pozisyon yok.</div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tarih</th>
                      <th style={th}>Mülk</th>
                      <th style={th}>Şehir</th>
                      <th style={th}>Yatırım</th>
                      <th style={th}>Entry</th>
                      <th style={th}>Units</th>
                      <th style={th}>Fiyat (Bugün)</th>
                      <th style={th}>Değer</th>
                      <th style={th}>K/Z</th>
                      <th style={th}>%PnL</th>
                      <th style={th}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={td}>{new Date(r.created_at).toLocaleString("tr-TR")}</td>
                        <td style={td}>{r.property?.title ?? r.property_id.slice(0, 8)}</td>
                        <td style={td}>
                          {r.property?.city ?? "-"}
                          {r.property?.district ? ` / ${r.property.district}` : ""}
                        </td>
                        <td style={td}>{formatNumber(Math.round(Number(r.amount)))} Çip</td>
                        <td style={td}>{Number(r._entry).toFixed(2)}</td>
                        <td style={td}>{Number(r._units).toFixed(4)}</td>
                        <td style={td}>{Number(r._currentPrice).toFixed(2)}</td>
                        <td style={td}>{formatNumber(Math.round(Number(r._currentValue)))} Çip</td>
                        <td style={td}>{formatSigned(Number(r._pnl))} Çip</td>
                        <td style={td}>{Number(r._pnlPct).toFixed(2)}%</td>
                        <td style={td}>
                          <button
                            onClick={() => handleSell(r)}
                            disabled={sellingId === r.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background:
                                sellingId === r.id
                                  ? "rgba(239,68,68,0.08)"
                                  : "rgba(239,68,68,0.16)",
                              border: "1px solid rgba(239,68,68,0.30)",
                              color: "white",
                              cursor: sellingId === r.id ? "not-allowed" : "pointer",
                              fontWeight: 900,
                              minWidth: 90,
                              opacity: sellingId === r.id ? 0.7 : 1,
                            }}
                          >
                            {sellingId === r.id ? "Satılıyor..." : "Sat"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, opacity: 0.7 }}>
              * Fiyat simülasyonu deterministik: aynı gün aynı property için aynı fiyat üretilir. (Yıllık getiri drift + küçük noise)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number) {
  try {
    return new Intl.NumberFormat("tr-TR").format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

function formatSigned(n: number) {
  const rounded = Number(n.toFixed(2));
  const s = rounded >= 0 ? "+" : "";
  return s + formatNumber(rounded);
}

const topbar: React.CSSProperties = {
  height: 56,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.2)",
  position: "sticky",
  top: 0,
  zIndex: 10,
  backdropFilter: "blur(10px)",
};

const card: React.CSSProperties = {
  borderRadius: 16,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
};

const label: React.CSSProperties = {
  padding: "14px 14px 0 14px",
  fontSize: 12,
  opacity: 0.75,
};

const value: React.CSSProperties = {
  padding: "6px 14px 14px 14px",
  fontSize: 20,
  fontWeight: 950,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  opacity: 0.95,
  whiteSpace: "nowrap",
};

const pill: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "white",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(239,68,68,0.15)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "white",
  cursor: "pointer",
};