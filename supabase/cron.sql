-- Hatırlatmaları (arama, numune, yaklaşan ihale, sözleşme son ayı) tetikleyen zamanlanmış iş (Supabase pg_cron + pg_net).
-- Vercel'in ücretsiz planı günde yalnızca bir cron çalıştırdığı için zamanlama Supabase tarafında.
--
-- Kurulum: Supabase > Database > Extensions'tan "pg_cron" ve "pg_net"i açın,
-- aşağıdaki iki değeri kendi değerlerinizle değiştirip SQL Editor'de çalıştırın.
--   <SITE>        ör. https://www.erenosmedikal.com/mobiluygulama
--   <CRON_SECRET> Vercel'deki CRON_SECRET ile aynı değer

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Hafta içi 09:00–18:00 (İstanbul = UTC+3 → 06:00–15:59 UTC), 15 dakikada bir.
-- Uygulama her kayıt için en fazla 2 saatte bir (ihaleye 24 saatten az kalınca saatte bir) bildirim gönderir;
-- son ayındaki sözleşmeler her gün 14:00'te (11:00 UTC) bir kez bildirilir.
select cron.schedule(
  'erenos-arama-hatirlatma',
  '*/15 6-15 * * 1-5',
  $$
  select net.http_post(
    url := '<SITE>/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Kaldırmak için: select cron.unschedule('erenos-arama-hatirlatma');
