-- Hatırlatmaları (arama, numune, yaklaşan ihale, sözleşme son ayı, anımsatıcılar) tetikleyen zamanlanmış iş (Supabase pg_cron + pg_net).
-- Vercel'in ücretsiz planı günde yalnızca bir cron çalıştırdığı için zamanlama Supabase tarafında.
--
-- Kurulum: Supabase > Database > Extensions'tan "pg_cron" ve "pg_net"i açın,
-- aşağıdaki iki değeri kendi değerlerinizle değiştirip SQL Editor'de çalıştırın.
--   <SITE>        https://erenosmobile.bulenttayfur.com
--   <CRON_SECRET> Vercel'deki CRON_SECRET ile aynı değer

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Her gün 08:00–22:45 (İstanbul = UTC+3 → 05:00–19:59 UTC), 15 dakikada bir. Satış hatırlatmaları
-- yalnızca hafta içi 09:00–18:00'de, anımsatıcılar kişinin ayarına göre mesai ya da 08:00–22:00 arasında gider.
-- Uygulama her kayıt için en fazla 2 saatte bir (ihaleye 24 saatten az kalınca saatte bir) bildirim gönderir;
-- son ayındaki sözleşmeler her gün 14:00'te (11:00 UTC) bir kez bildirilir.
select cron.schedule(
  'erenos-arama-hatirlatma',
  '*/15 5-19 * * *',
  $$
  select net.http_post(
    url := '<SITE>/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Kaldırmak için: select cron.unschedule('erenos-arama-hatirlatma');
