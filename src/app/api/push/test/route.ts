import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendToAll } from "@/lib/push";

/** Yalnızca isteği yapan kullanıcının cihazlarına deneme bildirimi gönderir. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const result = await sendToAll(
    { title: "Bildirimler açık", body: "Erenos Medikal bildirimleri bu cihaza ulaşıyor.", url: "/ayarlar", tag: "test" },
    { onlyUserId: user.id },
  );
  return NextResponse.json(result);
}
