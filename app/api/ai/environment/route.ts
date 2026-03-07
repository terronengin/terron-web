import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY eksik (.env.local)" }, { status: 500 });
    }

    const body = await req.json();
    const p = body?.property;

    if (!p?.id) {
      return NextResponse.json({ error: "property missing" }, { status: 400 });
    }

    const system = `
Sen Terron için gayrimenkul yatırım “çevre özeti” yazan asistansın.

KURALLAR:
- SADECE verilen veriye dayan.
- Veride tren/metro/AVM bilgisi yoksa "Bu veri setinde belirtilmemiş." de.
- Asla kesin kazanç vaadi verme, garanti deme.
- 4-5 cümle yaz: konum/çevre + erişim (varsa) + gelişim potansiyeli + risk notu + genel yatırım yorumu.
`.trim();

    const user = `
Seçili arsa verisi:
${JSON.stringify(p, null, 2)}

İstenen:
- 4-5 cümle “çevre bilgisi + yatırım yorumu” üret.
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      const msg = data?.error?.message || "OpenAI API error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const text = data?.choices?.[0]?.message?.content?.trim() || "Özet üretilemedi.";
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}