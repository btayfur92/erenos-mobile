import { requireUser } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("status", "sevk_bekliyor");

  return (
    <div className="min-h-dvh pb-28">
      {children}
      <BottomNav pendingShipments={count ?? 0} />
    </div>
  );
}
