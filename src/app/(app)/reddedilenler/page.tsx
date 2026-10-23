import { redirect } from "next/navigation";

/** Reddedilenler artık ana ekranın "Reddedilen" sekmesinde. Eski bağlantılar oraya yönlenir. */
export default async function RejectedPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/?f=red&q=${encodeURIComponent(q)}` : "/?f=red");
}
