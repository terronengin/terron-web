import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const { propertyId } = await req.json().catch(() => ({}));
    if (!propertyId || typeof propertyId !== "string") return bad("propertyId gerekli");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = getServiceRoleKey();
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl) return bad("NEXT_PUBLIC_SUPABASE_URL yok", 500);
    if (!serviceKey) return responseMissingServiceRole();
    if (!openaiKey) return bad("OPENAI_API_KEY yok", 500);

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1) Property çek
    const { data: p, error: pErr } = await sb
      .from("properties")
      .select("id,title,city,district,neighborhood,zoning_status,price_per_m2,total_area_m2,risk_score,development_score,expected_annual_return,last_30d_change,latitude,longitude")
      .eq("id", propertyId)
      .single();

    if (pErr || !p) return bad("Property bulunamadı: " + (pErr?.message ?? ""), 404);

    // 2) OpenAI prompt
    const client = new OpenAI({ apiKey: openaiKey });

    const system = `
Sen bir gayrimenkul analiz asistanısın.
KULLANICIYA "resmi kaynaktan doğrulanmadan kesin hüküm" verme.
Sana verilen arsa verisine göre: özet, artılar/eksiler, riskler, gelişim göstergeleri, yatırım notları üret.
ÇIKTIYI SADECE JSON ver.`;

    const user = {
      task: "Bu arsa için analiz üret ve JSON döndür.",
      property: p,
      output_format: {
        summary: "string (maks 6-8 cümle, net)",
        highlights: "string[] (max 6)",
        risks: "string[] (max 6)",
        development_signals: "string[] (max 6)",
        suggested_next_data_sources: "string[] (max 6) (hangi ek veri lazım: imar planı linki, belediye, altyapı vs.)",
        confidence: "number 0..1"
      },
    };

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content };
    }

    const aiSummary =
      typeof parsed?.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "AI özet üretemedi.";

    // 3) DB update
    const now = new Date().toISOString();
    const { error: upErr } = await sb
      .from("properties")
      .update({
        ai_summary: aiSummary,
        ai_payload: parsed,
        ai_updated_at: now,
      })
      .eq("id", propertyId);

    if (upErr) return bad("DB update failed: " + upErr.message, 500);

    return NextResponse.json({
      ok: true,
      propertyId,
      ai_summary: aiSummary,
      ai_payload: parsed,
      ai_updated_at: now,
    });
  } catch (e: any) {
    return bad(e?.message ?? "Unknown error", 500);
  }
}