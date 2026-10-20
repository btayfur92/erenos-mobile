import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-brand-600">404</p>
        <h1 className="mt-3 text-lg font-semibold">Sayfa bulunamadı</h1>
        <p className="mt-1 text-sm text-muted">Aradığınız kayıt silinmiş veya taşınmış olabilir.</p>
        <Link href="/" className="btn-primary mt-6">
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}
