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

-- Görüşme notu bir satış kaydının sayfasından da eklenebilir; not o kayda bağlanır (Bülent, 27 Kasım 2026).
-- Kayıt silinirse not Görüşmeler'de kalır, yalnızca bağlantısı kalkar.
alter table public.meetings add column if not exists record_id uuid references public.records (id) on delete set null;
create index if not exists meetings_record_idx on public.meetings (record_id, meeting_date desc);
