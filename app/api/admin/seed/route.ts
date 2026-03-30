import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { formatErrorForUi } from "@/lib/formatErrorForUi";
import {
  countSeededProperties,
  DEFAULT_SEED_TARGET,
  generateTurkeySeedRows,
  insertSeedRows,
  type RegionSeedOptions,
} from "@/lib/seed/seedTurkeyProperties";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

type SeedAction =
  | "seed"
  | "reseed"
  | "clear_seeded"
  | "deactivate_seeded"
  | "reset_platform"
  | "top_up_seed"
  | "seed_region";

const MAX_SEED = 15000;

/** Uzun süren toplu insert (15k) için */
export const maxDuration = 300;

/** Tüm pozisyonları siler, ilan stoklarını sıfırlar, kayıtlı her kullanıcı cüzdanını 1.000.000 ₺ yapar. */
async function resetPlatform(sb: SupabaseClient) {
  const { error: delErr } = await sb
    .from("positions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw delErr;

  const PAGE = 400;
  let offset = 0;
  for (;;) {
    const { data: props, error: pErr } = await sb
      .from("properties")
      .select("id,total_area_m2,available_m2,sold_m2")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (pErr) throw pErr;
    if (!props?.length) break;
    const iso = new Date().toISOString();
    await Promise.all(
      props.map((p) => {
        const total = Number(p.total_area_m2);
        const av = Number(p.available_m2 ?? 0);
        const sd = Number(p.sold_m2 ?? 0);
        const nextAvail = Number.isFinite(total) && total > 0 ? total : Math.max(0, av + sd);
        return sb
          .from("properties")
          .update({ sold_m2: 0, available_m2: nextAvail, updated_at: iso })
          .eq("id", p.id);
      })
    );
    offset += PAGE;
    if (props.length < PAGE) break;
  }

  let page = 1;
  const perPage = 1000;
  let userUpserts = 0;
  for (;;) {
    const { data: listData, error: listErr } = await sb.auth.admin.listUsers({ page, perPage });
    if (listErr) throw listErr;
    const users = listData.users;
    if (!users.length) break;
    const batch = users.map((u) => ({
      user_id: u.id,
      balance: 1000000,
    }));
    const { error: upErr } = await sb.from("wallets").upsert(batch, { onConflict: "user_id" });
    if (upErr) throw upErr;
    userUpserts += users.length;
    if (users.length < perPage) break;
    page += 1;
  }

  return { userUpserts };
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) return bad("Supabase URL / anon anahtar eksik", 500);
  if (!serviceKey) return bad("SUPABASE_SERVICE_ROLE_KEY tanımlı değil", 500);

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return bad("Yetki gerekli", 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !user?.email || !isAdminEmail(user.email)) {
    return bad("Bu işlem için yetkiniz yok", 403);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: { action?: string; count?: number; force?: boolean; city?: string; district?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body.action || "").toLowerCase() as SeedAction;
  if (
    ![
      "seed",
      "reseed",
      "clear_seeded",
      "deactivate_seeded",
      "reset_platform",
      "top_up_seed",
      "seed_region",
    ].includes(action)
  ) {
    return bad("Geçersiz action", 400);
  }

  const targetCount =
    typeof body.count === "number" && Number.isFinite(body.count) && body.count > 0
      ? Math.min(Math.floor(body.count), MAX_SEED)
      : DEFAULT_SEED_TARGET;

  try {
    if (action === "reset_platform") {
      const { userUpserts } = await resetPlatform(sb);
      return NextResponse.json({
        ok: true,
        message: `Pozisyonlar silindi, ilan stokları sıfırlandı, ${userUpserts} kullanıcı cüzdanı 1.000.000 ₺ olarak ayarlandı.`,
        userUpserts,
      });
    }

    /** Yalnızca seçilen il + ilçe için N adet sistem ilanı ekler (mevcut silinmez). */
    if (action === "seed_region") {
      const city = String(body.city ?? "").trim();
      const district = String(body.district ?? "").trim();
      if (!city || !district) return bad("İl ve ilçe seçin.", 400);
      const region: RegionSeedOptions = { city, district };
      console.log("[api/admin/seed] seed_region: generating before insert", { ...region, targetCount });
      const rows = generateTurkeySeedRows(targetCount, region);
      console.log("[api/admin/seed] generated row count", rows.length);
      const inserted = await insertSeedRows(sb, rows);
      return NextResponse.json({
        ok: true,
        inserted,
        city,
        district,
        message: `${inserted} ilan eklendi (${city} / ${district}).`,
      });
    }

    /** Mevcut silinmeden eksik sistem ilanını tamamlar (ör. 1 → 15.000). */
    if (action === "top_up_seed") {
      const existing = await countSeededProperties(sb);
      const need = Math.max(0, targetCount - existing);
      if (need === 0) {
        return NextResponse.json({
          ok: true,
          inserted: 0,
          existingSeeded: existing,
          target: targetCount,
          message: `Sistem ilanı zaten ${existing} adet (hedef ${targetCount}). Yeni eklenmedi.`,
        });
      }
      console.log("[api/admin/seed] top_up_seed: generating before insert", { existing, need, targetCount });
      const rows = generateTurkeySeedRows(need);
      console.log("[api/admin/seed] generated row count", rows.length);
      const inserted = await insertSeedRows(sb, rows);
      return NextResponse.json({
        ok: true,
        inserted,
        existingSeeded: existing,
        target: targetCount,
        message: `${inserted} yeni sistem ilanı eklendi (önce ${existing} → hedef ${targetCount}).`,
      });
    }

    if (action === "seed") {
      const existing = await countSeededProperties(sb);
      if (existing > 0 && !body.force) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Sistem portföyü zaten dolu. «15.000 ilana tamamla» veya «Yeniden üret» kullanın; sıfırdan yazmak için force: true.",
            seededCount: existing,
          },
          { status: 409 }
        );
      }
      if (existing > 0 && body.force) {
        const { error: delErr } = await sb.from("properties").delete().eq("is_real", false);
        if (delErr) throw delErr;
      }
      console.log("[api/admin/seed] seed: generating before insert", { targetCount, force: body.force });
      const rows = generateTurkeySeedRows(targetCount);
      console.log("[api/admin/seed] generated row count", rows.length);
      const inserted = await insertSeedRows(sb, rows);
      return NextResponse.json({
        ok: true,
        inserted,
        message: `${inserted} sistem ilanı eklendi.`,
      });
    }

    if (action === "reseed") {
      const { error: delErr } = await sb.from("properties").delete().eq("is_real", false);
      if (delErr) throw delErr;
      console.log("[api/admin/seed] reseed: generating before insert", { targetCount });
      const rows = generateTurkeySeedRows(targetCount);
      console.log("[api/admin/seed] generated row count", rows.length);
      const inserted = await insertSeedRows(sb, rows);
      return NextResponse.json({
        ok: true,
        inserted,
        cleared: true,
        message: `Eski sistem kayıtları silindi; ${inserted} yeni kayıt eklendi.`,
      });
    }

    if (action === "clear_seeded") {
      const { error: delErr } = await sb.from("properties").delete().eq("is_real", false);
      if (delErr) throw delErr;
      return NextResponse.json({
        ok: true,
        message: "Sistem portföyü kayıtları silindi.",
      });
    }

    if (action === "deactivate_seeded") {
      const { error: upErr } = await sb
        .from("properties")
        .update({ listing_status: "rejected", updated_at: new Date().toISOString() })
        .eq("is_real", false);
      if (upErr) throw upErr;
      return NextResponse.json({
        ok: true,
        message: "Sistem portföyü haritada gizlendi.",
      });
    }
  } catch (e: unknown) {
    console.error("[api/admin/seed] POST failed", e);
    const msg = formatErrorForUi(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return bad("İşlenemedi", 500);
}
