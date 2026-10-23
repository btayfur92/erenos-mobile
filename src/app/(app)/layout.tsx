import { requireUser } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireUser();
  // Rozet: bekleyen gidecek + gelecek sevkiyatlar
  const [{ count: outgoing }, { count: incoming }] = await Promise.all([
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "sevk_bekliyor"),
    supabase.from("incoming_shipments").select("id", { count: "exact", head: true }).eq("status", "bekliyor"),
  ]);

  return (
    <div className="min-h-dvh pb-28">
      {children}
      <BottomNav pendingShipments={(outgoing ?? 0) + (incoming ?? 0)} />
    </div>
  );
}
