"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type PositionProperty = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  expected_annual_return: number | null;
  risk_score: number | null;
  development_score: number | null;
  last_30d_change: number | null;
  total_area_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
  price_per_m2: number | null;
};

type PositionRow = {
  id: string;
  user_id: string;
  property_id: string;
  m2: number | null;
  total_paid: number | null;
  entry_price_m2: number | null;
  amount: number | null;
  units: number | null;
  entry_price: number | null;
  created_at: string;
  property?: PositionProperty | null;
  is_demo?: boolean;
};

type DemoPosition = {
  id: string;
  property_id: string;
  m2: number;
  total_paid: number;
  entry_price_m2: number;
  created_at: string;
  snapshot?: {
    title?: string;
    city?: string;
    district?: string | null;
    neighborhood?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
};

type EnrichedPositionRow = PositionRow & {
  _m2: number;
  _entryPriceM2: number;
  _totalPaid: number;
  _currentPriceM2: number;
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

  function simulateCurrentPricePerM2(propertyId: string, annualReturnPct: number, entryPriceM2: number) {
    const t = todayISO();
    const noise = (hash01(`${propertyId}:${t}`) - 0.5) * 0.04;
    const driftDaily = Math.pow(1 + annualReturnPct / 100, 1 / 365) - 1;

    const epoch = new Date("2026-01-01T00:00:00");
    const now = new Date();
    const days = Math.max(0, Math.floor((now.getTime() - epoch.getTime()) / 86400000));

    const drift = Math.pow(1 + driftDaily, days);
    const price = Math.max(1, Number(entryPriceM2 || 1)) * drift * (1 + noise);

    return Math.max(1, price);
  }

  function loadDemoPositions(): DemoPosition[] {
    try {
      const raw = localStorage.getItem("terron_demo_positions");
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveDemoPositions(list: DemoPosition[]) {
    localStorage.setItem("terron_demo_positions", JSON.stringify(list));
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
          m2,
          total_paid,
          entry_price_m2,
          amount,
          units,
          entry_price,
          created_at,
          property:properties (
            id,
            title,
            city,
            district,
            neighborhood,
            expected_annual_return,
            risk_score,
            development_score,
            last_30d_change,
            total_area_m2,
            available_m2,
            sold_m2,
            price_per_m2
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[portfolio] load error:", error);
        setErrorMsg(error.message);
      }

      const normalizedDbRows: PositionRow[] = ((data ?? []) as any[]).map((row) => ({
        ...row,
        property: Array.isArray(row.property) ? row.property[0] ?? null : row.property ?? null,
        is_demo: false,
      }));

      const demoRows: PositionRow[] = loadDemoPositions().map((d) => ({
        id: d.id,
        user_id: userId,
        property_id: d.property_id,
        m2: Number(d.m2 ?? 0),
        total_paid: Number(d.total_paid ?? 0),
        entry_price_m2: Number(d.entry_price_m2 ?? 0),
        amount: Number(d.total_paid ?? 0),
        units: Number(d.m2 ?? 0),
        entry_price: Number(d.entry_price_m2 ?? 0),
        created_at: d.created_at,
        is_demo: true,
        property: {
          id: d.property_id,
          title: d.snapshot?.title || "Demo Arsa",
          city: d.snapshot?.city || "—",
          district: d.snapshot?.district ?? null,
          neighborhood: d.snapshot?.neighborhood ?? null,
          expected_annual_return: 18,
          risk_score: 40,
          development_score: 60,
          last_30d_change: 2,
          total_area_m2: null,
          available_m2: null,
          sold_m2: null,
          price_per_m2: Number(d.entry_price_m2 ?? 0),
        },
      }));

      const merged = [...demoRows, ...normalizedDbRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setRows(merged);
      setLoading(false);
    };

    load();
  }, [userId]);

  const enriched = useMemo<EnrichedPositionRow[]>(() => {
    return rows.map((r) => {
      const entryM2 =
        Number(r.entry_price_m2 ?? 0) ||
        Number(r.entry_price ?? 0) ||
        Number(r.property?.price_per_m2 ?? 0) ||
        1;

      const m2 =
        r.m2 != null
          ? Number(r.m2)
          : r.units != null
          ? Number(r.units)
          : Number(r.amount ?? 0) / Math.max(1, entryM2);

      const totalPaid =
        r.total_paid != null
          ? Number(r.total_paid)
          : r.amount != null
          ? Number(r.amount)
          : m2 * entryM2;

      const annual = Number(r.property?.expected_annual_return ?? 18);
      const currentPriceM2 = simulateCurrentPricePerM2(r.property_id, annual, entryM2);
      const currentValue = m2 * currentPriceM2;

      const pnl = currentValue - totalPaid;
      const pnlPct = totalPaid > 0 ? (pnl / totalPaid) * 100 : 0;

      return {
        ...r,
        _m2: m2,
        _entryPriceM2: entryM2,
        _totalPaid: totalPaid,
        _currentPriceM2: currentPriceM2,
        _currentValue: currentValue,
        _pnl: pnl,
        _pnlPct: pnlPct,
      };
    });
  }, [rows]);

  const summary = useMemo(() => {
    const count = enriched.length;
    const totalM2 = enriched.reduce((acc, r) => acc + (Number(r._m2) || 0), 0);
    const totalInvested = enriched.reduce((acc, r) => acc + (Number(r._totalPaid) || 0), 0);
    const totalValue = enriched.reduce((acc, r) => acc + (Number(r._currentValue) || 0), 0);
    const pnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

    return { count, totalM2, totalInvested, totalValue, pnl, pnlPct };
  }, [enriched]);

  async function handleSell(row: EnrichedPositionRow) {
    if (sellingId) return;
    if (!userId) {
      alert("Kullanıcı bulunamadı.");
      return;
    }

    const sellValue = Math.round(Number(row._currentValue || 0));
    if (!Number.isFinite(sellValue) || sellValue <= 0) {
      alert("Satış tutarı hesaplanamadı.");
      return;
    }

    const m2 = Number(row._m2 || 0);
    if (!Number.isFinite(m2) || m2 <= 0) {
      alert("m² bilgisi hatalı.");
      return;
    }

    const ok = window.confirm(
      `${row.property?.title ?? "Bu pozisyon"} satılsın mı?\n\nSatılacak: ${formatNumber(
        m2
      )} m²\nTutar: ${formatNumber(sellValue)} Çip`
    );
    if (!ok) return;

    setSellingId(row.id);

    const prevRows = rows;
    const prevWallet = walletBalance;

    setRows((prev) => prev.filter((x) => x.id !== row.id));
    setWalletBalance((prev) => Math.round(Number(prev ?? 0) + sellValue));

    try {
      if (row.is_demo) {
        const demoList = loadDemoPositions();
        const nextDemoList = demoList.filter((x) => x.id !== row.id);
        saveDemoPositions(nextDemoList);

        const { data: walletRow, error: walletErr } = await supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();

        if (walletErr) throw walletErr;

        const dbBalance = Math.round(Number(walletRow?.balance ?? 0));
        const nextBalance = dbBalance + sellValue;

        const { error: walletUpdateErr } = await supabase
          .from("wallets")
          .update({ balance: nextBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (walletUpdateErr) throw walletUpdateErr;

        setWalletBalance(nextBalance);
        alert("Demo pozisyon satıldı ✅");
        return;
      }

      const { data: walletRow, error: walletErr } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletErr) throw walletErr;

      const dbBalance = Math.round(Number(walletRow?.balance ?? 0));
      const nextBalance = Math.round(dbBalance + sellValue);

      const { error: walletUpdateErr } = await supabase
        .from("wallets")
        .update({ balance: nextBalance, updated_at: new Date().toISOString() })
        .eq("user_id", userId);

      if (walletUpdateErr) throw walletUpdateErr;

      const { data: propRow, error: propErr } = await supabase
        .from("properties")
        .select("available_m2,sold_m2,total_area_m2")
        .eq("id", row.property_id)
        .maybeSingle();

      if (propErr) throw propErr;

      const totalArea = Number(propRow?.total_area_m2 ?? 0);
      const curAvailable = propRow?.available_m2 != null ? Number(propRow.available_m2) : null;
      const curSold = propRow?.sold_m2 != null ? Number(propRow.sold_m2) : null;

      const derivedAvailable =
        curAvailable != null ? curAvailable : Math.max(0, totalArea - Math.max(0, Number(curSold ?? 0)));

      const nextAvailable = derivedAvailable + m2;
      const nextSold = Math.max(0, Number(curSold ?? Math.max(0, totalArea - derivedAvailable)) - m2);

      const { error: propUpdateErr } = await supabase
        .from("properties")
        .update({
          available_m2: nextAvailable,
          sold_m2: nextSold,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.property_id);

      if (propUpdateErr) {
        await supabase.from("wallets").update({ balance: dbBalance }).eq("user_id", userId);
        throw propUpdateErr;
      }

      const { error: deleteErr } = await supabase
        .from("positions")
        .delete()
        .eq("id", row.id)
        .eq("user_id", userId);

      if (deleteErr) {
        await supabase.from("wallets").update({ balance: dbBalance }).eq("user_id", userId);

        await supabase
          .from("properties")
          .update({
            available_m2: derivedAvailable,
            sold_m2: curSold ?? Math.max(0, totalArea - derivedAvailable),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.property_id);

        throw deleteErr;
      }

      alert("Pozisyon satıldı ✅");
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

        <div style={{ fontWeight: 900, letterSpacing: 0.4 }}>Portföy (m²)</div>

        <div style={{ flex: 1 }} />

        <div style={pill}>Pozisyon: {summary.count}</div>
        <div style={pill}>Toplam m²: {formatNumber(summary.totalM2)}</div>
        <div style={pill}>Bakiye: {walletBalance == null ? "—" : `${formatNumber(walletBalance)} Çip`}</div>
        <div style={pill}>Değer: {formatNumber(Math.round(summary.totalValue))} Çip</div>

        <div style={{ fontSize: 12, opacity: 0.8 }}>{email}</div>

        <button onClick={logout} style={btnDanger}>
          Çıkış
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
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
            <div style={{ ...value, color: summary.pnl >= 0 ? "#86efac" : "#fca5a5" }}>
              {formatSigned(summary.pnl)} Çip
            </div>
          </div>
          <div style={card}>
            <div style={label}>% PnL</div>
            <div style={{ ...value, color: summary.pnlPct >= 0 ? "#86efac" : "#fca5a5" }}>
              {summary.pnlPct.toFixed(2)}%
            </div>
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
              Pozisyonlarım
            </div>

            {enriched.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.8 }}>Henüz pozisyon yok.</div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Tarih</th>
                      <th style={th}>Arsa</th>
                      <th style={th}>Bölge</th>
                      <th style={th}>m²</th>
                      <th style={th}>Entry ₺/m²</th>
                      <th style={th}>Bugün ₺/m²</th>
                      <th style={th}>Yatırım</th>
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
                          {r.property?.neighborhood ? ` / ${r.property.neighborhood}` : ""}
                        </td>
                        <td style={td}>{formatDecimal(r._m2)} m²</td>
                        <td style={td}>₺{formatDecimal(r._entryPriceM2)}</td>
                        <td style={td}>₺{formatDecimal(r._currentPriceM2)}</td>
                        <td style={td}>{formatNumber(Math.round(r._totalPaid))} Çip</td>
                        <td style={td}>{formatNumber(Math.round(r._currentValue))} Çip</td>
                        <td style={{ ...td, color: r._pnl >= 0 ? "#86efac" : "#fca5a5" }}>
                          {formatSigned(r._pnl)} Çip
                        </td>
                        <td style={{ ...td, color: r._pnlPct >= 0 ? "#86efac" : "#fca5a5" }}>
                          {Number(r._pnlPct).toFixed(2)}%
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => handleSell(r)}
                            disabled={sellingId === r.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "rgba(239,68,68,0.10)",
                              border: "1px solid rgba(239,68,68,0.30)",
                              color: "white",
                              cursor: sellingId === r.id ? "not-allowed" : "pointer",
                              fontWeight: 900,
                              minWidth: 110,
                              opacity: sellingId === r.id ? 0.7 : 1,
                            }}
                          >
                            {sellingId === r.id ? "Satılıyor..." : r.is_demo ? "Demo Sat" : "Sat"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, opacity: 0.7 }}>
              * “Bugün ₺/m²” fiyatı deterministik simülasyondur: entry ₺/m² + yıllık getiri drift + küçük noise.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(x);
  } catch {
    return String(Math.round(x));
  }
}

function formatDecimal(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(x);
  } catch {
    return String(x.toFixed(2));
  }
}

function formatSigned(n: number) {
  const x = Number(n);
  const rounded = Number.isFinite(x) ? x : 0;
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