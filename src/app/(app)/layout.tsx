import { requireUser } from "@/lib/auth";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { NavTracker } from "@/components/back-button";
import { BottomNav } from "@/components/bottom-nav";
import { canSell } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Alt menü rozeti: doğrudan teminden aktarılan + elle eklenen bekleyen sevkiyatlar. */
async function Nav() {
  const { supabase, profile } = await requireUser();
  const [{ count: outgoing }, { count: manual }] = await Promise.all([
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("status", "sevk_bekliyor"),
    supabase.from("manual_shipments").select("id", { count: "exact", head: true }).eq("status", "bekliyor"),
  ]);
  return <BottomNav pendingShipments={(outgoing ?? 0) + (manual ?? 0)} canAdd={canSell(profile.role)} />;
}

// Düzen veri beklemez: uygulama açılırken iskelet (loading.tsx) ve alt menü hemen görünür, veriler gelince dolar.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-28">
      {children}
      <AutoRefresh />
      <Suspense>
        <NavTracker />
      </Suspense>
      <Suspense fallback={<BottomNav pendingShipments={0} canAdd={false} />}>
        <Nav />
      </Suspense>
    </div>
  );
}
