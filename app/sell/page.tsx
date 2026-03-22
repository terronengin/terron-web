import Link from "next/link";

export default function SellPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Arsa satışı</h1>
      <p className="text-zinc-400 text-center max-w-md">
        Bu sayfa yakında güncellenecek. Şimdilik portföyünüzden veya panodan devam edebilirsiniz.
      </p>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          Panele dön
        </Link>
        <Link
          href="/portfolio"
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          Portföy
        </Link>
      </div>
    </div>
  );
}
