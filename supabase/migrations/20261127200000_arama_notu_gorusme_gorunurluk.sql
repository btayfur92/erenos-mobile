-- 1) Doğrudan teminde "Arandı" ile girilen arama notları Görüşmeler'de de görünür (Bülent, 27 Kasım 2026).
--    Her arama notu, kayda bağlı bir görüşme notu olarak da yazılır (servis: "Telefon görüşmesi").
-- 2) Görünürlük: kayıt sayfasından girilen notları (ve arama notlarını) herkes görür;
--    Görüşmeler sekmesinden girilen notları adminler, yöneticiler ve notu giren kişi görür; özel notları yalnızca adminler.

alter table public.meetings add column if not exists kind text not null default 'ziyaret';
alter table public.meetings drop constraint if exists meetings_kind_check;
alter table public.meetings add constraint meetings_kind_check check (kind in ('ziyaret', 'arama'));
alter table public.meetings add column if not exists call_log_id uuid unique references public.call_logs (id) on delete cascade;

-- Admin veya yönetici mi?
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active and role in ('admin', 'yonetici') from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "meetings_read" on public.meetings;
create policy "meetings_read" on public.meetings for select to authenticated
  using (
    public.is_active_user() and (
      case
        when private then public.is_admin()
        when record_id is not null then true
        else public.is_manager() or created_by = auth.uid()
      end
    )
  );

-- Arama notu girilince aynı notu kayda bağlı görüşme olarak yaz. Bir sorun olursa arama kaydı yine de girilir.
create or replace function public.call_log_to_meeting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into meetings (meeting_date, hospital, department, note, created_by, created_at, record_id, kind, call_log_id)
    select (new.created_at at time zone 'Europe/Istanbul')::date, r.hospital, 'Telefon görüşmesi', new.note,
           new.created_by, new.created_at, r.id, 'arama', new.id
    from records r
    where r.id = new.record_id
    on conflict (call_log_id) do nothing;
  exception when others then
    raise warning 'Arama notu görüşmelere yazılamadı: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists call_logs_to_meeting on public.call_logs;
create trigger call_logs_to_meeting after insert on public.call_logs
  for each row execute function public.call_log_to_meeting();

-- Daha önce girilmiş arama notlarını da Görüşmeler'e ekle (bir kez; tekrar çalıştırmak çift kayıt oluşturmaz).
do $$
declare
  c record;
begin
  for c in select * from public.call_logs loop
    begin
      insert into public.meetings (meeting_date, hospital, department, note, created_by, created_at, record_id, kind, call_log_id)
      select (c.created_at at time zone 'Europe/Istanbul')::date, r.hospital, 'Telefon görüşmesi', c.note,
             c.created_by, c.created_at, r.id, 'arama', c.id
      from public.records r
      where r.id = c.record_id
      on conflict (call_log_id) do nothing;
    exception when others then
      raise warning 'Arama notu % aktarılamadı: %', c.id, sqlerrm;
    end;
  end loop;
end;
$$;
