import { NextResponse } from "next/server";

/** Sunucu API’lerinde kullanılır; istemciye asla gönderilmez. */
export function getServiceRoleKey(): string | undefined {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : undefined;
}

export function responseMissingServiceRole() {
  return NextResponse.json(
    {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY tanımlı değil",
      code: "missing_service_role",
    },
    { status: 503 }
  );
}
