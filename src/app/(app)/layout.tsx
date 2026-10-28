import { requireUser } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";
import { canSell } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireUser();
  // Rozet: doğrudan teminden aktarılan + elle eklenen bekleyen sevkiyatlar
  const [{ count: outgoing }, { count: manual }] = await Promise.all([
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "sevk_bekliyor"),
    supabase.from("manual_shipments").select("id", { count: "exact", head: true }).eq("status", "bekliyor"),
  ]);

  return (
    <div className="min-h-dvh pb-28">
      {children}
      <BottomNav pendingShipments={(outgoing ?? 0) + (manual ?? 0)} canAdd={canSell(profile.role)} />
    </div>
  );
}
