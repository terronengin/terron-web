import { supabase } from "./supabaseClient";

/** Cüzdanı getirir, yoksa varsayılan bakiyeyle oluşturur. TopBar ve Profil sayfası ortak kullanır. */
export async function ensureAndLoadWallet(): Promise<number | null> {
  const { data: sessionRes } = await supabase.auth.getSession();
  const user = sessionRes.session?.user;
  if (!user) return null;

  const { data: w, error: wErr } = await supabase
    .from("wallets")
    .select("user_id,balance")
    .eq("user_id", user.id)
    .maybeSingle();
  if (wErr) {
    console.warn("[wallet] select error:", wErr);
    return null;
  }
  if (w?.balance != null) return Number(w.balance);

  const { data: ins, error: insErr } = await supabase
    .from("wallets")
    .insert({ user_id: user.id, balance: 1000000 })
    .select("balance")
    .single();
  if (insErr) {
    console.warn("[wallet] insert error:", insErr);
    return null;
  }
  return Number(ins.balance);
}

export function formatTRY(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(Math.round(n));
}
