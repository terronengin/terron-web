/**
 * UI / API yanıtlarında [object Object] göstermemek için hatayı okunur metne çevirir.
 * PostgREST / Supabase hataları: message, details, hint, code
 */
export function formatErrorForUi(err: unknown): string {
  if (err == null) return "Bilinmeyen hata";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);

  if (err instanceof Error) {
    const any = err as Error & { details?: string; hint?: string; code?: string };
    const parts: string[] = [];
    if (any.message) parts.push(any.message);
    if (typeof any.details === "string" && any.details) parts.push(`Ayrıntı: ${any.details}`);
    if (typeof any.hint === "string" && any.hint) parts.push(`İpucu: ${any.hint}`);
    if (typeof any.code === "string" && any.code) parts.push(`Kod: ${any.code}`);
    return parts.length ? parts.join("\n") : "Hata";
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message) parts.push(o.message);
    if (typeof o.details === "string" && o.details) parts.push(`Ayrıntı: ${o.details}`);
    if (typeof o.hint === "string" && o.hint) parts.push(`İpucu: ${o.hint}`);
    if (typeof o.code === "string" && o.code) parts.push(`Kod: ${o.code}`);
    if (parts.length) return parts.join("\n");
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return String(err);
    }
  }

  return String(err);
}

/** API JSON gövdesindeki `error` (string veya PostgREST nesnesi) */
export function formatApiErrorPayload(json: unknown): string {
  if (!json || typeof json !== "object") return "İşlem tamamlanamadı.";
  const j = json as Record<string, unknown>;
  if (typeof j.message === "string" && j.message.trim()) return j.message;
  if ("error" in j) return formatErrorForUi(j.error);
  return "İşlem tamamlanamadı.";
}
