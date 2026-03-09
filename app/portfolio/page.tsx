"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type Property = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  price_per_m2: number | null;
  expected_annual_return: number | null;
};

type Position = {
  id: string;
  property_id: string;
  m2: number | null;
  total_paid: number | null;
  entry_price_m2: number | null;
  amount: number | null;
  units: number | null;
  entry_price: number | null;
  created_at: string;
  property?: Property | null;
};

type Row = Position & {
  _m2: number;
  _entry: number;
  _paid: number;
  _price: number;
  _value: number;
  _pnl: number;
  _pnlPct: number;
};

export default function PortfolioPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<Position[]>([]);
  const [wallet, setWallet] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }
      setUserId(u.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    load();
  }, [userId]);

  async function load() {
    setLoading(true);

    const { data: w } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (w?.balance != null) setWallet(Number(w.balance));

    const { data } = await supabase
      .from("positions")
      .select(
        `
        id,
        property_id,
        m2,
        total_paid,
        entry_price_m2,
        amount,
        units,
        entry_price,
        created_at,
        property:properties(
          id,
          title,
          city,
          district,
          neighborhood,
          price_per_m2,
          expected_annual_return
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    setRows((data ?? []) as any);
    setLoading(false);
  }

  function todaySeed(id: string) {
    const t = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (let i = 0; i < (id + t).length; i++) {
      h = (h << 5) - h + (id + t).charCodeAt(i);
      h |= 0;
    }
    return (h % 100) / 100;
  }

  const data = useMemo<Row[]>(() => {
    return rows.map((r) => {
      const entry =
        r.entry_price_m2 ??
        r.entry_price ??
        r.property?.price_per_m2 ??
        1;

      const m2 =
        r.m2 ??
        r.units ??
        (r.amount ?? 0) / entry;

      const paid =
        r.total_paid ??
        r.amount ??
        m2 * entry;

      const annual = r.property?.expected_annual_return ?? 0;

      const noise = (todaySeed(r.property_id) - 0.5) * 0.05;
      const drift = Math.pow(1 + annual / 100, 1 / 365);

      const price = entry * drift * (1 + noise);

      const value = m2 * price;
      const pnl = value - paid;
      const pct = paid ? (pnl / paid) * 100 : 0;

      return {
        ...r,
        _m2: m2,
        _entry: entry,
        _paid: paid,
        _price: price,
        _value: value,
        _pnl: pnl,
        _pnlPct: pct
      };
    });
  }, [rows]);

  const summary = useMemo(() => {
    let invested = 0;
    let value = 0;
    let m2 = 0;

    data.forEach((r) => {
      invested += r._paid;
      value += r._value;
      m2 += r._m2;
    });

    const pnl = value - invested;
    const pct = invested ? (pnl / invested) * 100 : 0;

    return { invested, value, pnl, pct, m2 };
  }, [data]);

  async function sell(r: Row) {
    if (!userId) return;

    if (!confirm("Pozisyon satılsın mı?")) return;

    setSelling(r.id);

    const value = Math.round(r._value);

    try {
      const { data: w } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();

      const newBalance = Math.round((w.balance ?? 0) + value);

      await supabase
        .from("wallets")
        .update({ balance: newBalance })
        .eq("user_id", userId);

      const { data: prop } = await supabase
        .from("properties")
        .select("available_m2,sold_m2")
        .eq("id", r.property_id)
        .single();

      await supabase
        .from("properties")
        .update({
          available_m2: (prop.available_m2 ?? 0) + r._m2,
          sold_m2: Math.max(0, (prop.sold_m2 ?? 0) - r._m2)
        })
        .eq("id", r.property_id);

      await supabase
        .from("positions")
        .delete()
        .eq("id", r.id);

      alert("Satış tamamlandı");

      load();
    } catch (e) {
      alert("Satış hatası");
      console.error(e);
    }

    setSelling(null);
  }

  if (loading) return <div style={{ padding: 30 }}>Yükleniyor...</div>;

  return (
    <div style={{ padding: 30, color: "white", background:"#0b1220", minHeight:"100vh"}}>

      <h2>Portföy</h2>

      <div style={{display:"flex",gap:20,marginBottom:20}}>
        <div>Toplam m²: {summary.m2.toFixed(2)}</div>
        <div>Yatırım: {summary.invested.toFixed(0)}</div>
        <div>Değer: {summary.value.toFixed(0)}</div>
        <div>K/Z: {summary.pnl.toFixed(0)}</div>
        <div>%PnL: {summary.pct.toFixed(2)}</div>
        <div>Bakiye: {wallet}</div>
      </div>

      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr>
            <th>Arsa</th>
            <th>m²</th>
            <th>Entry ₺/m²</th>
            <th>Bugün ₺/m²</th>
            <th>Yatırım</th>
            <th>Değer</th>
            <th>K/Z</th>
            <th>%</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {data.map((r)=>(
            <tr key={r.id}>
              <td>{r.property?.title}</td>
              <td>{r._m2.toFixed(2)}</td>
              <td>{r._entry.toFixed(2)}</td>
              <td>{r._price.toFixed(2)}</td>
              <td>{r._paid.toFixed(0)}</td>
              <td>{r._value.toFixed(0)}</td>
              <td>{r._pnl.toFixed(0)}</td>
              <td>{r._pnlPct.toFixed(2)}</td>

              <td>
                <button
                  onClick={()=>sell(r)}
                  disabled={selling===r.id}
                >
                  Sat
                </button>
              </td>

            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}