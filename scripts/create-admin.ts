/**
 * İlk yönetici kullanıcıyı oluşturur.
 * Kullanım: npm run create-admin -- <kullanici_adi> <sifre> "<Ad Soyad>"
 * .env.local içindeki NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY kullanılır.
 */
import { createClient } from "@supabase/supabase-js";
import { normalizeUsername, usernameToEmail } from "../src/lib/config";

async function main() {
  const [rawUsername, password, fullName = ""] = process.argv.slice(2);
  if (!rawUsername || !password) {
    console.error('Kullanım: npm run create-admin -- <kullanici_adi> <sifre> "<Ad Soyad>"');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(".env.local içinde NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı.");
    process.exit(1);
  }
  const username = normalizeUsername(rawUsername);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, role: "admin" },
  });
  if (error) {
    console.error("Oluşturulamadı:", error.message);
    process.exit(1);
  }
  console.log(`Yönetici oluşturuldu: ${username} (${data.user?.id})`);
}

main();
