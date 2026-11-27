-- Satış kullanıcısı da teslim edildi / teslim alındı işaretleyebilir (Bülent, 27 Kasım 2026).
create or replace function public.can_deliver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active and role in ('admin', 'yonetici', 'satis', 'sevkiyat') from public.profiles where id = auth.uid()), false);
$$;
