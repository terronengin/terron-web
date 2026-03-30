"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { isAdminEmail } from "../../lib/admin/isAdmin";
import { isVisibleOnExplorer } from "../../lib/propertyListing";
import type { InquiryStatus, PropertyInquiryRow } from "../../lib/propertyInquiry";
import { INQUIRY_STATUS_LABELS } from "../../lib/propertyInquiry";
import type { AdminAnalyticsPayload } from "@/lib/admin/analytics";
import { formatApiErrorPayload, formatErrorForUi } from "@/lib/formatErrorForUi";
import { listDistrictOptionsForCity, TR_CITY_SEEDS } from "@/lib/regions/trRegions";

type RealListingRow = {
  id: string;
  title: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  ada_no: string | null;
  parcel_no: string | null;
  total_area_m2: number | null;
  available_m2: number | null;
  sold_m2: number | null;
  price_per_m2: number | null;
  status: string | null;
  listing_status: string | null;
  is_real: boolean | null;
  is_verified: boolean | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  submitted_by: string | null;
  approval_note: string | null;
  deed_image_url: string | null;
  listing_description: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at?: string | null;
};

function fmtNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("tr-TR").format(value);
}

function fmtTRY(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

/** TL — tabular rakam, taşmayı azaltır */
function fmtTRYTL(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(value));
  return `₺\u00A0${n}`;
}

type AdminFilterTab = "all" | "seeded" | "user_uploaded" | "pending" | "approved" | "rejected";
type MainTab = "listings" | "inquiries";

function matchesAdminFilter(p: RealListingRow, f: AdminFilterTab): boolean {
  const ls = String(p.listing_status ?? "").toLowerCase();
  if (f === "all") return true;
  if (f === "seeded") return p.is_real === false;
  if (f === "user_uploaded") return p.is_real === true;
  if (f === "pending") return ls === "pending";
  if (f === "rejected") return ls === "rejected";
  if (f === "approved") return ls === "approved";
  return true;
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return String(iso);
  }
}

function waHref(phone: string, text?: string) {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const n = d.startsWith("90") ? d : `90${d.replace(/^0/, "")}`;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const MAX_SEED_UI = 15000;

export default function AdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [properties, setProperties] = useState<RealListingRow[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    activeOnMap: 0,
    pending: 0,
    approvedOrActive: 0,
    rejected: 0,
    seeded: 0,
    userUploaded: 0,
    cityCount: 0,
    totalAvailableM2: 0,
    verified: 0,
  });
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [infoText, setInfoText] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdminFilterTab>("pending");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedTargetCount, setSeedTargetCount] = useState(15000);
  const [seedMode, setSeedMode] = useState<"top_up" | "reseed" | "seed_force">("top_up");
  const sortedCitySeeds = useMemo(
    () => [...TR_CITY_SEEDS].sort((a, b) => a.city.localeCompare(b.city, "tr")),
    []
  );
  const [seedRegionCity, setSeedRegionCity] = useState(() => TR_CITY_SEEDS[0]!.city);
  const regionDistrictOptions = useMemo(() => listDistrictOptionsForCity(seedRegionCity), [seedRegionCity]);
  const [seedRegionDistrict, setSeedRegionDistrict] = useState(() => listDistrictOptionsForCity(TR_CITY_SEEDS[0]!.city)[0]!);
  const [seedRegionCount, setSeedRegionCount] = useState(500);

  useEffect(() => {
    const opts = listDistrictOptionsForCity(seedRegionCity);
    setSeedRegionDistrict((prev) => (opts.includes(prev) ? prev : opts[0] ?? ""));
  }, [seedRegionCity]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const [mainTab, setMainTab] = useState<MainTab>("listings");
  const [inquiries, setInquiries] = useState<PropertyInquiryRow[]>([]);
  const [inquiryFilter, setInquiryFilter] = useState<InquiryStatus | "all">("all");
  const [inquiryNoteDrafts, setInquiryNoteDrafts] = useState<Record<string, string>>({});
  const [updatingInquiryId, setUpdatingInquiryId] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<AdminAnalyticsPayload | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [treasuryModalOpen, setTreasuryModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const allowed = isAdminEmail(email);

  const loadAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setAnalyticsError("Oturum bulunamadı.");
        return;
      }
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { ok?: boolean; error?: unknown } & Partial<AdminAnalyticsPayload>;
      if (!res.ok || !json.ok) {
        throw new Error(formatApiErrorPayload(json));
      }
      const { generatedAt, properties, positions, fees, wallets, daily } = json;
      if (!generatedAt || !properties || !positions || !fees || !wallets || !daily) {
        throw new Error("Eksik analitik yanıtı");
      }
      setAnalytics({
        generatedAt,
        properties,
        positions,
        fees: {
          ledgerBuyFees: fees.ledgerBuyFees ?? 0,
          ledgerSellFees: fees.ledgerSellFees ?? 0,
          ledgerTotalFees: fees.ledgerTotalFees ?? 0,
          ledgerBuyVolume: fees.ledgerBuyVolume ?? 0,
          ledgerSellVolume: fees.ledgerSellVolume ?? 0,
          estimatedBuyFeesFromPositions: fees.estimatedBuyFeesFromPositions ?? 0,
          estimatedSellFeesFromSoldM2: fees.estimatedSellFeesFromSoldM2 ?? 0,
          totalEstimatedTerronTreasury: fees.totalEstimatedTerronTreasury ?? 0,
        },
        wallets,
        daily: (daily ?? []).map((d) => ({
          date: d.date,
          buyFee: d.buyFee ?? 0,
          sellFee: d.sellFee ?? 0,
          buyVolume: d.buyVolume ?? d.volumePaid ?? 0,
          sellVolume: d.sellVolume ?? 0,
          volumePaid: d.volumePaid ?? 0,
          positionOpens: d.positionOpens ?? 0,
        })),
      });
    } catch (e: unknown) {
      console.warn("[admin] analytics", e);
      setAnalytics(null);
      setAnalyticsError(formatErrorForUi(e));
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText("");
      const { data, error } = await supabase
        .from("properties")
        .select(
          "id,title,city,district,neighborhood,ada_no,parcel_no,total_area_m2,available_m2,sold_m2,price_per_m2,status,listing_status,is_real,is_verified,owner_name,owner_phone,owner_email,submitted_by,approval_note,deed_image_url,listing_description,latitude,longitude,created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as RealListingRow[];
      setProperties(rows);

      const { data: invData, error: invErr } = await supabase
        .from("property_inquiries")
        .select("*")
        .order("created_at", { ascending: false });

      if (invErr) {
        console.warn("[admin] property_inquiries load:", invErr);
        setInquiries([]);
      } else {
        setInquiries((invData ?? []) as PropertyInquiryRow[]);
      }

      const cities = new Set<string>();
      let totalAvail = 0;
      for (const r of rows) {
        if (r.city && String(r.city).trim()) cities.add(String(r.city).trim());
        const a = Number(r.available_m2);
        if (Number.isFinite(a) && a > 0) totalAvail += a;
      }
      const st = {
        total: rows.length,
        activeOnMap: rows.filter((r) =>
          isVisibleOnExplorer({
            listing_status: r.listing_status,
          })
        ).length,
        pending: rows.filter((r) => String(r.listing_status).toLowerCase() === "pending").length,
        approvedOrActive: rows.filter((r) => {
          const s = String(r.listing_status).toLowerCase();
          return s === "approved";
        }).length,
        rejected: rows.filter((r) => String(r.listing_status).toLowerCase() === "rejected").length,
        seeded: rows.filter((r) => r.is_real === false).length,
        userUploaded: rows.filter((r) => r.is_real === true).length,
        cityCount: cities.size,
        totalAvailableM2: totalAvail,
        verified: rows.filter((r) => r.is_verified === true).length,
      };
      setStats(st);
    } catch (err: unknown) {
      console.error("[admin] load error:", err);
      setErrorText(formatErrorForUi(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked || !allowed) return;
    loadAll();
  }, [authChecked, allowed, loadAll]);

  useEffect(() => {
    if (!authChecked || !allowed) return;
    loadAnalytics();
  }, [authChecked, allowed, loadAnalytics]);

  const visible = useMemo(() => {
    return properties.filter((p) => matchesAdminFilter(p, filter));
  }, [properties, filter]);

  const pendingUserUploads = useMemo(
    () =>
      properties.filter(
        (p) =>
          p.is_real === true &&
          String(p.listing_status).toLowerCase() === "pending"
      ),
    [properties]
  );

  const publishedRows = useMemo(
    () =>
      properties.filter((p) => {
        const s = String(p.listing_status).toLowerCase();
        return s === "approved";
      }),
    [properties]
  );

  const seededRows = useMemo(
    () => properties.filter((p) => p.is_real === false),
    [properties]
  );

  const inquiryStatsByProperty = useMemo(() => {
    const map = new Map<
      string,
      { total: number; lastAt: string | null; negotiating: number; won: number; lost: number }
    >();
    for (const q of inquiries) {
      const pid = String(q.property_id);
      const prev = map.get(pid) ?? {
        total: 0,
        lastAt: null as string | null,
        negotiating: 0,
        won: 0,
        lost: 0,
      };
      prev.total += 1;
      const st = String(q.status || "").toLowerCase();
      if (st === "negotiating") prev.negotiating += 1;
      if (st === "closed_won") prev.won += 1;
      if (st === "closed_lost") prev.lost += 1;
      const ca = q.created_at;
      if (ca && (!prev.lastAt || new Date(ca) > new Date(prev.lastAt))) prev.lastAt = ca;
      map.set(pid, prev);
    }
    return map;
  }, [inquiries]);

  const filteredInquiries = useMemo(() => {
    if (inquiryFilter === "all") return inquiries;
    return inquiries.filter((i) => String(i.status).toLowerCase() === inquiryFilter);
  }, [inquiries, inquiryFilter]);

  const inquirySummary = useMemo(() => {
    const n = (s: string) => inquiries.filter((i) => String(i.status).toLowerCase() === s).length;
    return {
      total: inquiries.length,
      new: n("new"),
      contacted: n("contacted"),
      negotiating: n("negotiating"),
      won: n("closed_won"),
      lost: n("closed_lost"),
    };
  }, [inquiries]);

  const treasuryDailyRows = useMemo(() => {
    if (!analytics?.daily?.length) return [];
    const asc = [...analytics.daily].sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    return asc.map((d) => {
      const dayFees = (d.buyFee ?? 0) + (d.sellFee ?? 0);
      cum += dayFees;
      return { ...d, cumulativeTotalFee: cum };
    });
  }, [analytics]);

  const treasuryDailyDisplay = useMemo(() => [...treasuryDailyRows].reverse(), [treasuryDailyRows]);

  async function updateInquiryStatus(id: string, status: InquiryStatus) {
    try {
      setUpdatingInquiryId(id);
      setErrorText("");
      setInfoText("");
      const { error } = await supabase.from("property_inquiries").update({ status }).eq("id", id);
      if (error) throw error;
      setInfoText("Talep durumu güncellendi.");
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingInquiryId(null);
    }
  }

  async function saveInquiryNote(id: string) {
    try {
      setUpdatingInquiryId(id);
      setErrorText("");
      setInfoText("");
      const note = inquiryNoteDrafts[id] ?? "";
      const { error } = await supabase.from("property_inquiries").update({ admin_note: note || null }).eq("id", id);
      if (error) throw error;
      setInfoText("Talep notu kaydedildi.");
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingInquiryId(null);
    }
  }

  async function handleApprove(p: RealListingRow) {
    try {
      setUpdatingId(p.id);
      setErrorText("");
      setInfoText("");
      const totalArea = Number(p.total_area_m2 || 0);
      const note = noteDrafts[p.id] ?? p.approval_note ?? "";
      const { error } = await supabase
        .from("properties")
        .update({
          listing_status: "approved",
          status: "active",
          available_m2: p.available_m2 != null ? Number(p.available_m2) : totalArea,
          sold_m2: p.sold_m2 != null ? Number(p.sold_m2) : 0,
          approval_note: note || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (error) throw error;
      setInfoText(`"${p.title || "İlan"}" onaylandı ve yayına alındı.`);
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleReject(p: RealListingRow) {
    try {
      setUpdatingId(p.id);
      setErrorText("");
      setInfoText("");
      const note = noteDrafts[p.id] ?? p.approval_note ?? "";
      const { error } = await supabase
        .from("properties")
        .update({
          listing_status: "rejected",
          status: "rejected",
          approval_note: note || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (error) throw error;
      setInfoText(`"${p.title || "İlan"}" reddedildi.`);
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleVerified(p: RealListingRow, next: boolean) {
    try {
      setUpdatingId(p.id);
      setErrorText("");
      const { error } = await supabase
        .from("properties")
        .update({ is_verified: next, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw error;
      setInfoText(next ? "Doğrulandı işaretlendi." : "Doğrulama kaldırıldı.");
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveNoteOnly(p: RealListingRow) {
    try {
      setUpdatingId(p.id);
      const note = noteDrafts[p.id] ?? "";
      const { error } = await supabase
        .from("properties")
        .update({ approval_note: note || null, updated_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw error;
      setInfoText("Admin notu kaydedildi.");
      await loadAll();
    } catch (err: any) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setUpdatingId(null);
    }
  }

  async function callSeedApi(
    action:
      | "seed"
      | "reseed"
      | "clear_seeded"
      | "deactivate_seeded"
      | "reset_platform"
      | "top_up_seed"
      | "seed_region",
    opts?: { count?: number; force?: boolean; city?: string; district?: string }
  ) {
    try {
      setSeedBusy(true);
      setErrorText("");
      setInfoText("");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı. Yeniden giriş yapın.");
      const res = await fetch("/api/admin/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          count: opts?.count,
          force: opts?.force,
          city: opts?.city,
          district: opts?.district,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: unknown; message?: string };
      if (!res.ok || !json.ok) throw new Error(formatApiErrorPayload(json));
      setInfoText(json.message || "Tamamlandı.");
      await loadAll();
      await loadAnalytics();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("terron:properties:refresh"));
      }
    } catch (err: unknown) {
      setErrorText(formatErrorForUi(err));
    } finally {
      setSeedBusy(false);
    }
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "#031326", color: "white", padding: 32 }}>
        Yükleniyor...
      </div>
    );
  }

  if (!email) {
    return (
      <div style={{ minHeight: "100vh", background: "#031326", color: "white", padding: 32 }}>
        <p>Giriş gerekli.</p>
        <button
          onClick={() => router.replace("/login")}
          style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, cursor: "pointer" }}
        >
          Giriş
        </button>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: "100vh", background: "#031326", color: "white", padding: 32 }}>
        <h1>Erişim yok</h1>
        <p style={{ opacity: 0.8 }}>Bu sayfa yalnızca yetkili yönetici hesapları içindir.</p>
        <button
          onClick={() => router.replace("/dashboard")}
          style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, cursor: "pointer" }}
        >
          Dashboard
        </button>
      </div>
    );
  }

  const pill = (active: boolean) => ({
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${active ? "rgba(245,215,110,0.55)" : "rgba(255,255,255,0.12)"}`,
    background: active ? "rgba(245,215,110,0.12)" : "rgba(255,255,255,0.04)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #031326 0%, #071a33 100%)",
        color: "white",
        padding: "24px 16px 48px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            marginBottom: 18,
            width: "100%",
          }}
        >
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              padding: "10px 16px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Dashboard
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 32, fontWeight: 950, margin: 0 }}>Admin • İlanlar ve portföy</h1>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                opacity: 0.72,
                letterSpacing: "0.04em",
                color: "#e2e8f0",
              }}
            >
              (YÖNETİCİ ADMİN - ENGİN CİVİL)
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={analyticsLoading}
            style={{
              marginLeft: "auto",
              padding: "10px 16px",
              borderRadius: 14,
              border: "1px solid rgba(245,215,110,0.35)",
              background: "rgba(245,215,110,0.08)",
              color: "#fef3c7",
              cursor: analyticsLoading ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: 13,
              opacity: analyticsLoading ? 0.65 : 1,
            }}
          >
            {analyticsLoading ? "Özet yenileniyor…" : "Özeti yenile"}
          </button>
        </div>

        <div
          style={{
            marginBottom: 22,
            padding: 20,
            borderRadius: 22,
            border: "1px solid rgba(245,215,110,0.2)",
            background: "linear-gradient(135deg, rgba(15,28,52,0.95), rgba(8,18,38,0.92))",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", opacity: 0.75, color: "#c9a227" }}>
                OPERASYONEL ÖZET
              </div>
              <div style={{ fontSize: 18, fontWeight: 950, marginTop: 4 }}>Piyasa ve kasa (yalnızca yönetici)</div>
            </div>
            {analytics?.generatedAt ? (
              <div style={{ fontSize: 11, opacity: 0.65, alignSelf: "center" }}>
                Veri: {fmtDateTime(analytics.generatedAt)}
              </div>
            ) : null}
          </div>

          {analyticsError ? (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(248,113,113,0.35)",
                background: "rgba(80,20,20,0.25)",
                color: "#fecaca",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {analyticsError}{" "}
              <span style={{ opacity: 0.85 }}>
                Sunucuda `SUPABASE_SERVICE_ROLE_KEY` tanımlı olmalı; aksi halde toplu pozisyon / cüzdan verisi okunamaz.
              </span>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  opacity: 0.72,
                  color: "#94a3b8",
                  marginBottom: 12,
                }}
              >
                KOMİSYON GELİRİ (GERÇEK İŞLEMLER)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    borderRadius: 16,
                    padding: "16px 18px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "rgba(6,14,30,0.65)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#cbd5e1", lineHeight: 1.35 }}>
                    ALIM KOMİSYONU
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 950,
                      marginTop: 10,
                      color: "#f8fafc",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                      wordBreak: "break-all",
                    }}
                  >
                    {analytics ? fmtTRYTL(analytics.fees.ledgerBuyFees) : analyticsLoading ? "…" : "—"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.4 }}>
                    Alım yapıldıkça birikir (%0,5 modeli, ödenen tutar üzerinden).
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: 16,
                    padding: "16px 18px",
                    border: "1px solid rgba(148,163,184,0.2)",
                    background: "rgba(6,14,30,0.65)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#cbd5e1", lineHeight: 1.35 }}>
                    SATIŞ KOMİSYONU
                  </div>
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 950,
                      marginTop: 10,
                      color: "#f8fafc",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.02em",
                      wordBreak: "break-all",
                    }}
                  >
                    {analytics ? fmtTRYTL(analytics.fees.ledgerSellFees) : analyticsLoading ? "…" : "—"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.4 }}>
                    Satış yapıldıkça birikir (brüt satış üzerinden %1).
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  padding: "20px 22px",
                  border: "1px solid rgba(245,215,110,0.42)",
                  background: "linear-gradient(145deg, rgba(201,162,39,0.14), rgba(15,28,52,0.85))",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#fef9c3", letterSpacing: "0.04em" }}>
                      TERRON KASASI
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4, color: "#e7e5e4" }}>
                      Gerçek alım + gerçek satış komisyonu toplamı
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 950,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.03em",
                      wordBreak: "break-all",
                    }}
                  >
                    {analytics ? fmtTRYTL(analytics.fees.ledgerTotalFees) : analyticsLoading ? "…" : "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTreasuryModalOpen(true)}
                  disabled={!analytics || analyticsLoading}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fef3c7",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: !analytics || analyticsLoading ? "not-allowed" : "pointer",
                    opacity: !analytics || analyticsLoading ? 0.55 : 1,
                  }}
                >
                  Günlük dökümü aç
                </button>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  opacity: 0.72,
                  color: "#94a3b8",
                  marginBottom: 12,
                }}
              >
                İŞLEM HACMİ (GERÇEK, TL)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    borderRadius: 16,
                    padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(6,14,30,0.55)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>Alışta ödenen toplam</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 950,
                      marginTop: 8,
                      fontVariantNumeric: "tabular-nums",
                      wordBreak: "break-all",
                    }}
                  >
                    {analytics ? fmtTRYTL(analytics.fees.ledgerBuyVolume) : analyticsLoading ? "…" : "—"}
                  </div>
                </div>
                <div
                  style={{
                    borderRadius: 16,
                    padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(6,14,30,0.55)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>Satışta brüt işlem tutarı</div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 950,
                      marginTop: 8,
                      fontVariantNumeric: "tabular-nums",
                      wordBreak: "break-all",
                    }}
                  >
                    {analytics ? fmtTRYTL(analytics.fees.ledgerSellVolume) : analyticsLoading ? "…" : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  opacity: 0.72,
                  color: "#94a3b8",
                  marginBottom: 12,
                }}
              >
                PİYASA ÖZETİ
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 14,
                }}
              >
                {[
                  {
                    k: "Toplam ilan alanı",
                    v: analytics ? `${fmtNumber(analytics.properties.totalAreaM2)} m²` : analyticsLoading ? "…" : "—",
                    sub: "Kayıtlı parseller",
                  },
                  {
                    k: "Liste değeri",
                    v: analytics ? fmtTRYTL(analytics.properties.listValueAtPrice) : analyticsLoading ? "…" : "—",
                    sub: "Σ (m² × liste)",
                  },
                  {
                    k: "Platformda satılan m²",
                    v: analytics ? fmtNumber(analytics.properties.soldM2) : analyticsLoading ? "…" : "—",
                    sub: "İlan stok kaydı",
                  },
                  {
                    k: "Satışa kalan m²",
                    v: analytics ? fmtNumber(analytics.properties.availableM2) : analyticsLoading ? "…" : "—",
                    sub: "Açık stok",
                  },
                  {
                    k: "Açık pozisyon / yatırımcı",
                    v: analytics
                      ? `${fmtNumber(analytics.positions.openCount)} / ${fmtNumber(analytics.positions.uniqueInvestors)}`
                      : analyticsLoading
                        ? "…"
                        : "—",
                    sub: "Aktif işlem • kullanıcı",
                  },
                ].map((x) => (
                  <div
                    key={x.k}
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(6,14,30,0.55)",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.78, fontWeight: 800 }}>{x.k}</div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 950,
                        marginTop: 8,
                        color: "#f8fafc",
                        fontVariantNumeric: "tabular-nums",
                        wordBreak: "break-all",
                      }}
                    >
                      {x.v}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.55, marginTop: 6, lineHeight: 1.35 }}>{x.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.65,
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                lineHeight: 1.5,
              }}
            >
              Kullanıcı cüzdanları (bilgi):{" "}
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>
                {analytics ? fmtTRYTL(analytics.wallets.totalUserBalances) : "—"}
              </span>{" "}
              · {analytics?.wallets.walletRows ?? 0} cüzdan — kullanıcı bakiyesi platform karı değildir.
            </div>
          </div>

          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 16, lineHeight: 1.45 }}>
            Komisyon tutarları yalnızca gerçekleşen alım ve satışlarda <code>platform_revenue</code> defterine yazılır;
            tahmin kullanılmaz. TERRON KASASI, bu defterdeki alış ve satış komisyonlarının toplamıdır.
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button type="button" style={pill(mainTab === "listings")} onClick={() => setMainTab("listings")}>
            İlanlar
          </button>
          <button type="button" style={pill(mainTab === "inquiries")} onClick={() => setMainTab("inquiries")}>
            Satış Talepleri
          </button>
        </div>

        {errorText ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,90,90,0.35)",
              background: "rgba(120,20,20,0.25)",
              color: "#ffb3b3",
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          >
            {errorText}
          </div>
        ) : null}

        {infoText ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(80,220,140,0.35)",
              background: "rgba(20,90,50,0.22)",
              color: "#b9ffd1",
            }}
          >
            {infoText}
          </div>
        ) : null}

        {mainTab === "listings" ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 22,
              }}
            >
              {[
                { k: "Toplam kayıt", v: stats.total },
                { k: "Haritada yayında", v: stats.activeOnMap },
                { k: "Onay bekleyen", v: stats.pending },
                { k: "Yayında / onaylı", v: stats.approvedOrActive },
                { k: "Sistem portföyü", v: stats.seeded },
                { k: "Kullanıcı yüklemesi", v: stats.userUploaded },
                { k: "Şehir sayısı", v: stats.cityCount },
                { k: "Toplam satışa açık m²", v: fmtNumber(stats.totalAvailableM2) },
                { k: "Doğrulanan (kullanıcı)", v: stats.verified },
              ].map((x) => (
                <div
                  key={x.k}
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(10,22,44,0.65)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{x.k}</div>
                  <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{loading ? "…" : x.v}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginBottom: 22,
                padding: 16,
                borderRadius: 18,
                border: "1px solid rgba(245,215,110,0.22)",
                background: "rgba(10,22,44,0.55)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10, opacity: 0.92 }}>
                Sistem portföyü (harita verisi)
              </div>
              <div
                style={{
                  marginBottom: 14,
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(52,211,153,0.35)",
                  background: "rgba(6,40,28,0.35)",
                  maxWidth: 520,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: "#b9ffd1" }}>
                  Arsa üret (il bazlı dağılım)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.85 }}>
                    Hedef ilan adedi (1–{MAX_SEED_UI.toLocaleString("tr-TR")})
                    <input
                      type="number"
                      min={1}
                      max={MAX_SEED_UI}
                      value={seedTargetCount}
                      onChange={(e) => setSeedTargetCount(Number(e.target.value))}
                      style={{
                        width: 140,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.85, minWidth: 220 }}>
                    İşlem
                    <select
                      value={seedMode}
                      onChange={(e) => setSeedMode(e.target.value as "top_up" | "reseed" | "seed_force")}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "#0f2744",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      <option value="top_up">Eksikleri tamamla (mevcut silinmez)</option>
                      <option value="reseed">Sıfırdan üret (tüm sistem ilanını sil, yenile)</option>
                      <option value="seed_force">Boş kataloga yaz (force — doluysa hata)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={seedBusy}
                    onClick={() => {
                      const n = Math.min(MAX_SEED_UI, Math.max(1, Math.floor(Number(seedTargetCount) || 1)));
                      setSeedTargetCount(n);
                      if (typeof window === "undefined") return;
                      if (seedMode === "top_up") {
                        if (
                          !window.confirm(
                            `Sistem kataloğunu ${n.toLocaleString("tr-TR")} hedefe tamamlamak için eksik kayıtlar eklenecek (mevcut silinmez). Birkaç dakika sürebilir. Devam?`
                          )
                        )
                          return;
                        void callSeedApi("top_up_seed", { count: n });
                      } else if (seedMode === "reseed") {
                        if (
                          !window.confirm(
                            `Tüm sistem portföyü silinip ${n.toLocaleString("tr-TR")} yeni ilan üretilecek (il/ilçe/mahalle dağılımı). Devam?`
                          )
                        )
                          return;
                        void callSeedApi("reseed", { count: n });
                      } else {
                        if (
                          !window.confirm(
                            `Sistem ilanları boşsa ${n.toLocaleString("tr-TR")} kayıt eklenir; doluysa hata alırsınız — «Eksikleri tamamla» kullanın. Devam?`
                          )
                        )
                          return;
                        void callSeedApi("seed", { count: n, force: true });
                      }
                    }}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 12,
                      border: "1px solid rgba(52,211,153,0.6)",
                      background: "rgba(52,211,153,0.22)",
                      color: "#ecfdf5",
                      fontWeight: 900,
                      cursor: seedBusy ? "not-allowed" : "pointer",
                      opacity: seedBusy ? 0.6 : 1,
                    }}
                  >
                    Arsa üret
                  </button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 10, lineHeight: 1.45 }}>
                  Kayıtlar iller arasında dengeli dağıtılır; fiyat ve satış oranı bölge likiditesine göre üretilir.
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(56,189,248,0.4)",
                  background: "rgba(8,47,73,0.45)",
                  maxWidth: 640,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: "#bae6fd" }}>
                  Seçili il / ilçede arsa ekle
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.88, minWidth: 160 }}>
                    İl
                    <select
                      value={seedRegionCity}
                      onChange={(e) => setSeedRegionCity(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "#0f2744",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: 160,
                      }}
                    >
                      {sortedCitySeeds.map((c) => (
                        <option key={c.city} value={c.city}>
                          {c.city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.88, minWidth: 200 }}>
                    İlçe
                    <select
                      value={seedRegionDistrict}
                      onChange={(e) => setSeedRegionDistrict(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "#0f2744",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: 200,
                      }}
                    >
                      {regionDistrictOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, opacity: 0.85 }}>
                    Adet (1–{MAX_SEED_UI.toLocaleString("tr-TR")})
                    <input
                      type="number"
                      min={1}
                      max={MAX_SEED_UI}
                      value={seedRegionCount}
                      onChange={(e) => setSeedRegionCount(Number(e.target.value))}
                      style={{
                        width: 120,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(0,0,0,0.25)",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={seedBusy || !seedRegionDistrict}
                    onClick={() => {
                      const n = Math.min(MAX_SEED_UI, Math.max(1, Math.floor(Number(seedRegionCount) || 1)));
                      setSeedRegionCount(n);
                      if (typeof window === "undefined") return;
                      if (!seedRegionCity.trim() || !seedRegionDistrict.trim()) {
                        setErrorText("İl ve ilçe seçin.");
                        return;
                      }
                      if (
                        !window.confirm(
                          `${seedRegionCity} / ${seedRegionDistrict} için ${n.toLocaleString("tr-TR")} adet sistem ilanı eklenecek (mevcut kayıtlar silinmez). Devam?`
                        )
                      )
                        return;
                      void callSeedApi("seed_region", {
                        count: n,
                        city: seedRegionCity.trim(),
                        district: seedRegionDistrict.trim(),
                      });
                    }}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 12,
                      border: "1px solid rgba(56,189,248,0.55)",
                      background: "rgba(56,189,248,0.18)",
                      color: "#e0f2fe",
                      fontWeight: 900,
                      cursor: seedBusy ? "not-allowed" : "pointer",
                      opacity: seedBusy ? 0.6 : 1,
                    }}
                  >
                    Bu bölgede üret
                  </button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 10, lineHeight: 1.45 }}>
                  İl listesi seed verisinden gelir; ilçeler aynı üretim kurallarıyla (Merkez, Kuzey, …) eşlenir. Koordinatlar il
                  merkezine göre üretilir.
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  type="button"
                  disabled={seedBusy}
                  onClick={() => {
                    if (typeof window !== "undefined" && !window.confirm("Sistem portföyü kayıtları kalıcı silinecek. Devam?")) return;
                    callSeedApi("clear_seeded");
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(248,113,113,0.45)",
                    background: "rgba(248,113,113,0.1)",
                    color: "#fecaca",
                    fontWeight: 800,
                    cursor: seedBusy ? "not-allowed" : "pointer",
                    opacity: seedBusy ? 0.6 : 1,
                  }}
                >
                  Sistem kayıtlarını temizle
                </button>
                <button
                  type="button"
                  disabled={seedBusy}
                  onClick={() => {
                    if (typeof window !== "undefined" && !window.confirm("Sistem portföyü haritada gizlenecek. Devam?")) return;
                    callSeedApi("deactivate_seeded");
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#e5e7eb",
                    fontWeight: 800,
                    cursor: seedBusy ? "not-allowed" : "pointer",
                    opacity: seedBusy ? 0.6 : 1,
                  }}
                >
                  Sistem kayıtlarını gizle
                </button>
                <button
                  type="button"
                  disabled={seedBusy}
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm(
                        "TÜM kullanıcı pozisyonları silinecek, ilan stokları sıfırlanacak, kayıtlı her üyenin cüzdanı 1.000.000 ₺ olacak. Geri alınamaz. Devam?"
                      )
                    )
                      return;
                    callSeedApi("reset_platform");
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(251,146,60,0.55)",
                    background: "rgba(251,146,60,0.12)",
                    color: "#ffedd5",
                    fontWeight: 800,
                    cursor: seedBusy ? "not-allowed" : "pointer",
                    opacity: seedBusy ? 0.6 : 1,
                  }}
                >
                  Üyeleri sıfırla (pozisyon + 1M ₺)
                </button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, marginTop: 10, lineHeight: 1.45 }}>
                Üstteki kutudan hedef adedi ve işlem türünü seçip «Arsa üret» ile çalıştırın. «Eksikleri tamamla» mevcut
                silmeden hedefe ulaşır; «Sıfırdan üret» tüm sistem ilanını silip yeniler; «Boş kataloga yaz» yalnızca
                sistem ilanı yokken anlamlıdır.
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {(
                [
                  ["all", "Tümü"],
                  ["seeded", "Sistem"],
                  ["user_uploaded", "Kullanıcı"],
                  ["pending", "Bekleyen"],
                  ["approved", "Yayında"],
                  ["rejected", "Reddedilen"],
                ] as const
              ).map(([f, label]) => (
                <button key={f} type="button" style={pill(filter === f)} onClick={() => setFilter(f)}>
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 22,
              }}
            >
              {[
                { k: "Toplam talep", v: inquirySummary.total },
                { k: "Yeni", v: inquirySummary.new },
                { k: "İletişime geçildi", v: inquirySummary.contacted },
                { k: "Pazarlıkta", v: inquirySummary.negotiating },
                { k: "Kazanılan", v: inquirySummary.won },
                { k: "Kaybedilen", v: inquirySummary.lost },
              ].map((x) => (
                <div
                  key={x.k}
                  style={{
                    borderRadius: 18,
                    padding: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(10,22,44,0.65)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>{x.k}</div>
                  <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{loading ? "…" : x.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {(
                [
                  ["all", "Tümü"],
                  ["new", INQUIRY_STATUS_LABELS.new],
                  ["contacted", INQUIRY_STATUS_LABELS.contacted],
                  ["negotiating", INQUIRY_STATUS_LABELS.negotiating],
                  ["closed_won", INQUIRY_STATUS_LABELS.closed_won],
                  ["closed_lost", INQUIRY_STATUS_LABELS.closed_lost],
                ] as const
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  style={pill(inquiryFilter === f)}
                  onClick={() => setInquiryFilter(f as InquiryStatus | "all")}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {mainTab === "listings" ? (
        <div style={{ display: "grid", gap: 22 }}>
          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(10,22,44,0.78)",
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>A) Bekleyen kullanıcı yüklemeleri</div>
            {loading ? (
              <div style={{ opacity: 0.75, padding: 18 }}>Yükleniyor...</div>
            ) : pendingUserUploads.length === 0 ? (
              <div style={{ opacity: 0.75, padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.03)" }}>
                Onay bekleyen kullanıcı ilanı yok.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {pendingUserUploads.map((property) => {
                  const isBusy = updatingId === property.id;
                  const ls = String(property.listing_status || "").toLowerCase();
                  return (
                    <div
                      key={property.id}
                      style={{
                        borderRadius: 18,
                        border: "1px solid rgba(255,255,255,0.07)",
                        background: "#04142b",
                        padding: 20,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 16,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 900,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "rgba(245,215,110,0.15)",
                                border: "1px solid rgba(245,215,110,0.35)",
                              }}
                            >
                              Kullanıcı ilanı
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 900,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: "rgba(250,204,21,0.12)",
                                border: "1px solid rgba(255,255,255,0.12)",
                              }}
                            >
                              {ls || "—"}
                            </span>
                            {property.is_verified ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: "rgba(56,189,248,0.15)",
                                  border: "1px solid rgba(56,189,248,0.35)",
                                }}
                              >
                                Doğrulandı
                              </span>
                            ) : null}
                          </div>

                          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
                            {property.title || "Başlıksız"}
                          </div>
                          <div style={{ opacity: 0.82, marginBottom: 6 }}>
                            {property.city || "-"} / {property.district || "-"} / {property.neighborhood || "-"}
                          </div>
                          <div style={{ opacity: 0.72, fontSize: 13, marginBottom: 4 }}>
                            Sahip: {property.owner_name || "—"} • {property.owner_phone || "—"} •{" "}
                            {property.owner_email || "—"}
                          </div>
                          <div style={{ opacity: 0.72, fontSize: 13, marginBottom: 4 }}>
                            Gönderen: {property.submitted_by || "—"}
                          </div>
                          <div style={{ opacity: 0.72, fontSize: 13 }}>
                            Ada/Parsel: {property.ada_no || "—"} / {property.parcel_no || "—"} • Toplam:{" "}
                            {fmtNumber(property.total_area_m2)} m² • Satılabilir: {fmtNumber(property.available_m2)} m² •
                            Fiyat: {fmtNumber(property.price_per_m2)} ₺/m²
                          </div>
                          <div style={{ opacity: 0.55, fontSize: 12, marginTop: 6 }}>
                            Konum:{" "}
                            {property.latitude != null && property.longitude != null
                              ? `${property.latitude}, ${property.longitude}`
                              : "—"}
                          </div>
                          {property.listing_description ? (
                            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85, lineHeight: 1.45 }}>
                              {property.listing_description}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Admin notu</div>
                            <textarea
                              value={noteDrafts[property.id] ?? property.approval_note ?? ""}
                              onChange={(e) =>
                                setNoteDrafts((prev) => ({ ...prev, [property.id]: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                minHeight: 64,
                                borderRadius: 12,
                                padding: 10,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "white",
                                fontSize: 13,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => saveNoteOnly(property)}
                              disabled={isBusy}
                              style={{
                                marginTop: 8,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "transparent",
                                color: "#dbeafe",
                                cursor: isBusy ? "not-allowed" : "pointer",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Notu kaydet
                            </button>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
                          <button
                            onClick={() => handleApprove(property)}
                            disabled={isBusy || ls === "approved"}
                            style={{
                              border: "none",
                              borderRadius: 12,
                              padding: "12px 18px",
                              background: isBusy || ls === "approved" ? "#2d6b4d" : "#39d98a",
                              color: "#062112",
                              fontWeight: 900,
                              cursor: isBusy || ls === "approved" ? "not-allowed" : "pointer",
                            }}
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => handleReject(property)}
                            disabled={isBusy || ls === "rejected"}
                            style={{
                              border: "1px solid rgba(255,255,255,0.14)",
                              borderRadius: 12,
                              padding: "12px 18px",
                              background: "transparent",
                              color: "#ff8b8b",
                              fontWeight: 900,
                              cursor: isBusy || ls === "rejected" ? "not-allowed" : "pointer",
                            }}
                          >
                            Reddet
                          </button>
                          <button
                            onClick={() => toggleVerified(property, !property.is_verified)}
                            disabled={isBusy}
                            style={{
                              border: "1px solid rgba(56,189,248,0.4)",
                              borderRadius: 12,
                              padding: "12px 18px",
                              background: "rgba(56,189,248,0.12)",
                              color: "#e0f2fe",
                              fontWeight: 900,
                              cursor: isBusy ? "not-allowed" : "pointer",
                            }}
                          >
                            {property.is_verified ? "Doğrulamayı kaldır" : "Doğrulandı işaretle"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(10,22,44,0.78)",
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>B) Yayında / onaylı</div>
            <div style={{ maxHeight: 420, overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                    <th style={{ padding: 10 }}>Kaynak</th>
                    <th style={{ padding: 10 }}>Durum</th>
                    <th style={{ padding: 10 }}>Şehir</th>
                    <th style={{ padding: 10 }}>İlçe</th>
                    <th style={{ padding: 10 }}>Mahalle</th>
                    <th style={{ padding: 10 }}>₺/m²</th>
                    <th style={{ padding: 10 }}>m²</th>
                    <th style={{ padding: 10 }}>Oluşturulma</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 16, opacity: 0.7 }}>
                        Yükleniyor...
                      </td>
                    </tr>
                  ) : publishedRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 16, opacity: 0.7 }}>
                        Kayıt yok.
                      </td>
                    </tr>
                  ) : (
                    publishedRows.slice(0, 400).map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: 10 }}>{r.is_real === false ? "Sistem" : "Kullanıcı"}</td>
                        <td style={{ padding: 10 }}>{String(r.listing_status || "—")}</td>
                        <td style={{ padding: 10 }}>{r.city || "—"}</td>
                        <td style={{ padding: 10 }}>{r.district || "—"}</td>
                        <td style={{ padding: 10 }}>{r.neighborhood || "—"}</td>
                        <td style={{ padding: 10 }}>{fmtNumber(r.price_per_m2)}</td>
                        <td style={{ padding: 10 }}>{fmtNumber(r.total_area_m2)}</td>
                        <td style={{ padding: 10 }}>{fmtDateTime(r.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && publishedRows.length > 400 ? (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>İlk 400 satır gösteriliyor.</div>
            ) : null}
          </div>

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(10,22,44,0.78)",
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>C) Sistem portföyü</div>
            <div style={{ maxHeight: 420, overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                    <th style={{ padding: 10 }}>Kaynak</th>
                    <th style={{ padding: 10 }}>Durum</th>
                    <th style={{ padding: 10 }}>Şehir</th>
                    <th style={{ padding: 10 }}>İlçe</th>
                    <th style={{ padding: 10 }}>Mahalle</th>
                    <th style={{ padding: 10 }}>₺/m²</th>
                    <th style={{ padding: 10 }}>m²</th>
                    <th style={{ padding: 10 }}>Oluşturulma</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 16, opacity: 0.7 }}>
                        Yükleniyor...
                      </td>
                    </tr>
                  ) : seededRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 16, opacity: 0.7 }}>
                        Sistem portföyü boş. Yukarıdan üretin.
                      </td>
                    </tr>
                  ) : (
                    seededRows.slice(0, 400).map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <td style={{ padding: 10 }}>Sistem</td>
                        <td style={{ padding: 10 }}>{String(r.listing_status || "—")}</td>
                        <td style={{ padding: 10 }}>{r.city || "—"}</td>
                        <td style={{ padding: 10 }}>{r.district || "—"}</td>
                        <td style={{ padding: 10 }}>{r.neighborhood || "—"}</td>
                        <td style={{ padding: 10 }}>{fmtNumber(r.price_per_m2)}</td>
                        <td style={{ padding: 10 }}>{fmtNumber(r.total_area_m2)}</td>
                        <td style={{ padding: 10 }}>{fmtDateTime(r.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && seededRows.length > 400 ? (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>İlk 400 satır gösteriliyor.</div>
            ) : null}
          </div>

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(10,22,44,0.78)",
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
              Filtreli liste ({loading ? "…" : visible.length})
            </div>
            {loading ? (
              <div style={{ opacity: 0.75, padding: 18 }}>Yükleniyor...</div>
            ) : visible.length === 0 ? (
              <div style={{ opacity: 0.75, padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.03)" }}>
                Bu filtrede kayıt yok.
              </div>
            ) : (
              <div style={{ maxHeight: 520, overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)", textAlign: "left" }}>
                      <th style={{ padding: 10 }}>Kaynak</th>
                      <th style={{ padding: 10 }}>Durum</th>
                      <th style={{ padding: 10 }}>Şehir</th>
                      <th style={{ padding: 10 }}>İlçe</th>
                      <th style={{ padding: 10 }}>Mahalle</th>
                      <th style={{ padding: 10 }}>₺/m²</th>
                      <th style={{ padding: 10 }}>m²</th>
                      <th style={{ padding: 10 }}>Oluşturulma</th>
                      <th style={{ padding: 10 }}>Talep özeti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 500).map((property) => {
                      const ls = String(property.listing_status || "").toLowerCase();
                      const srcLabel =
                        property.is_real === false ? "Sistem" : property.is_real === true ? "Kullanıcı" : "—";
                      const s = inquiryStatsByProperty.get(property.id);
                      return (
                        <tr key={property.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <td style={{ padding: 10 }}>{srcLabel}</td>
                          <td style={{ padding: 10 }}>{ls || "—"}</td>
                          <td style={{ padding: 10 }}>{property.city || "—"}</td>
                          <td style={{ padding: 10 }}>{property.district || "—"}</td>
                          <td style={{ padding: 10 }}>{property.neighborhood || "—"}</td>
                          <td style={{ padding: 10 }}>{fmtNumber(property.price_per_m2)}</td>
                          <td style={{ padding: 10 }}>{fmtNumber(property.total_area_m2)}</td>
                          <td style={{ padding: 10 }}>{fmtDateTime(property.created_at)}</td>
                          <td style={{ padding: 10, fontSize: 11, opacity: 0.85 }}>
                            {ls === "approved" ? (
                              <span>
                                Talep: {s?.total ?? 0} • Kazanılan: {s?.won ?? 0}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && visible.length > 500 ? (
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>İlk 500 satır gösteriliyor.</div>
            ) : null}
          </div>
        </div>
        ) : (
          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(10,22,44,0.78)",
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 14 }}>
              Talepler ({loading ? "…" : filteredInquiries.length})
            </div>

            {loading ? (
              <div style={{ opacity: 0.75, padding: 18 }}>Yükleniyor...</div>
            ) : filteredInquiries.length === 0 ? (
              <div style={{ opacity: 0.75, padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.03)" }}>
                Bu filtrede talep yok.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {filteredInquiries.map((inq) => {
                  const busy = updatingInquiryId === inq.id;
                  const raw = String(inq.status || "new").toLowerCase();
                  const stSel: InquiryStatus = (
                    ["new", "contacted", "negotiating", "closed_won", "closed_lost"] as const
                  ).includes(raw as InquiryStatus)
                    ? (raw as InquiryStatus)
                    : "new";
                  const pref = INQUIRY_STATUS_LABELS[stSel] ?? raw;
                  const statusBg =
                    stSel === "new"
                      ? "rgba(250,204,21,0.15)"
                      : stSel === "contacted"
                      ? "rgba(56,189,248,0.15)"
                      : stSel === "negotiating"
                      ? "rgba(245,215,110,0.15)"
                      : stSel === "closed_won"
                      ? "rgba(34,197,94,0.15)"
                      : stSel === "closed_lost"
                      ? "rgba(248,113,113,0.15)"
                      : "rgba(255,255,255,0.08)";
                  const wa = waHref(
                    inq.customer_phone,
                    `Merhaba, ${inq.property_title || "ilan"} talebi hakkında Terron satış ekibiyim.`
                  );

                  return (
                    <div
                      key={inq.id}
                      style={{
                        borderRadius: 18,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "#04142b",
                        padding: 20,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 16,
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontWeight: 900, fontSize: 17 }}>{inq.property_title || "İlan"}</span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 900,
                                padding: "4px 10px",
                                borderRadius: 999,
                                background: statusBg,
                                border: "1px solid rgba(255,255,255,0.12)",
                              }}
                            >
                              {pref}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.88, marginBottom: 4 }}>
                            <b>{inq.customer_name}</b> • {inq.customer_phone}
                            {inq.customer_email ? ` • ${inq.customer_email}` : ""}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
                            {fmtDateTime(inq.created_at)} • Tercih: {inq.contact_preference || "—"}
                          </div>
                          {inq.message ? (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 13,
                                opacity: 0.88,
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {inq.message}
                            </div>
                          ) : null}
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
                            İstenen m²: {inq.requested_m2 != null ? fmtNumber(Number(inq.requested_m2)) : "—"} • Bütçe:{" "}
                            {inq.budget != null ? `${fmtNumber(Number(inq.budget))} ₺` : "—"}
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Admin notu</div>
                            <textarea
                              value={inquiryNoteDrafts[inq.id] ?? inq.admin_note ?? ""}
                              onChange={(e) =>
                                setInquiryNoteDrafts((prev) => ({ ...prev, [inq.id]: e.target.value }))
                              }
                              style={{
                                width: "100%",
                                minHeight: 80,
                                borderRadius: 12,
                                padding: 10,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "white",
                                fontSize: 13,
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => saveInquiryNote(inq.id)}
                              disabled={busy}
                              style={{
                                marginTop: 8,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "transparent",
                                color: "#dbeafe",
                                cursor: busy ? "not-allowed" : "pointer",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Notu kaydet
                            </button>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
                          <label style={{ fontSize: 11, opacity: 0.7 }}>Durum</label>
                          <select
                            value={stSel}
                            disabled={busy}
                            onChange={(e) => updateInquiryStatus(inq.id, e.target.value as InquiryStatus)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.14)",
                              color: "white",
                              fontWeight: 700,
                            }}
                          >
                            {(Object.keys(INQUIRY_STATUS_LABELS) as InquiryStatus[]).map((k) => (
                              <option key={k} value={k}>
                                {INQUIRY_STATUS_LABELS[k]}
                              </option>
                            ))}
                          </select>
                          <a
                            href={`tel:${inq.customer_phone}`}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: "rgba(255,255,255,0.05)",
                              color: "#e0f2fe",
                              fontWeight: 800,
                              textAlign: "center",
                              textDecoration: "none",
                            }}
                          >
                            Ara
                          </a>
                          {inq.customer_email ? (
                            <a
                              href={`mailto:${inq.customer_email}`}
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(255,255,255,0.05)",
                                color: "#e0f2fe",
                                fontWeight: 800,
                                textAlign: "center",
                                textDecoration: "none",
                              }}
                            >
                              E-posta
                            </a>
                          ) : null}
                          {wa ? (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid rgba(34,197,94,0.45)",
                                background: "rgba(34,197,94,0.12)",
                                color: "#bbf7d0",
                                fontWeight: 800,
                                textAlign: "center",
                                textDecoration: "none",
                              }}
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {treasuryModalOpen && analytics ? (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setTreasuryModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(3,10,24,0.82)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(980px, 100%)",
                maxHeight: "min(88vh, 900px)",
                overflow: "auto",
                borderRadius: 22,
                border: "1px solid rgba(245,215,110,0.28)",
                background: "linear-gradient(180deg, #0a1628, #071223)",
                padding: 22,
                boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#c9a227", letterSpacing: "0.1em" }}>
                    TERRON KASASI
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 950, margin: "8px 0 0" }}>Günlük komisyon dökümü</h2>
                  <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.75, lineHeight: 1.55 }}>
                    Gerçek işlem kayıtları: günlük alış / satış komisyonu ve kümülatif Terron toplamı.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTreasuryModalOpen(false)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Kapat
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>TERRON KASASI</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 950,
                      marginTop: 6,
                      fontVariantNumeric: "tabular-nums",
                      wordBreak: "break-all",
                    }}
                  >
                    {fmtTRYTL(analytics.fees.ledgerTotalFees)}
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>ALIM KOMİSYONU</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 950,
                      marginTop: 6,
                      fontVariantNumeric: "tabular-nums",
                      wordBreak: "break-all",
                    }}
                  >
                    {fmtTRYTL(analytics.fees.ledgerBuyFees)}
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>SATIŞ KOMİSYONU</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 950,
                      marginTop: 6,
                      fontVariantNumeric: "tabular-nums",
                      wordBreak: "break-all",
                    }}
                  >
                    {fmtTRYTL(analytics.fees.ledgerSellFees)}
                  </div>
                </div>
              </div>

              <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ minWidth: 720 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "88px repeat(6, minmax(96px, 1fr))",
                      gap: 8,
                      padding: "12px 14px",
                      background: "rgba(255,255,255,0.05)",
                      fontSize: 10,
                      fontWeight: 900,
                      opacity: 0.8,
                    }}
                  >
                    <div>Tarih</div>
                    <div style={{ textAlign: "right" }}>Alış kom.</div>
                    <div style={{ textAlign: "right" }}>Satış kom.</div>
                    <div style={{ textAlign: "right" }}>Alış hacmi</div>
                    <div style={{ textAlign: "right" }}>Satış hacmi</div>
                    <div style={{ textAlign: "right" }}>Poz.</div>
                    <div style={{ textAlign: "right" }}>Küm. Terron</div>
                  </div>
                  {treasuryDailyDisplay.map((d) => (
                    <div
                      key={d.date}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "88px repeat(6, minmax(96px, 1fr))",
                        gap: 8,
                        padding: "12px 14px",
                        fontSize: 12,
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        alignItems: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <div style={{ whiteSpace: "nowrap" }}>{d.date}</div>
                      <div style={{ textAlign: "right", wordBreak: "break-all" }}>{fmtTRYTL(d.buyFee)}</div>
                      <div style={{ textAlign: "right", wordBreak: "break-all" }}>{fmtTRYTL(d.sellFee ?? 0)}</div>
                      <div style={{ textAlign: "right", wordBreak: "break-all", opacity: 0.92 }}>
                        {fmtTRYTL(d.buyVolume ?? d.volumePaid)}
                      </div>
                      <div style={{ textAlign: "right", wordBreak: "break-all", opacity: 0.92 }}>
                        {fmtTRYTL(d.sellVolume ?? 0)}
                      </div>
                      <div style={{ textAlign: "right" }}>{fmtNumber(d.positionOpens)}</div>
                      <div style={{ textAlign: "right", fontWeight: 800, color: "#a7f3d0", wordBreak: "break-all" }}>
                        {fmtTRYTL(d.cumulativeTotalFee)}
                      </div>
                    </div>
                  ))}
                </div>
                {treasuryDailyDisplay.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 13, opacity: 0.65 }}>
                    Henüz defter kaydı yok. Alım/satış yaptıkça satırlar oluşur.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
