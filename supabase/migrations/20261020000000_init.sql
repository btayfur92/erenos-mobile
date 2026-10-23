-- Erenos Mobile — ilk şema
-- Satış kayıtları (Yaklaşık Maliyet, Doğrudan Temin), ürün kalemleri,
-- arama notları, sevkiyatlar, push abonelikleri ve kullanıcı profilleri.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipler
-- ---------------------------------------------------------------------------

create type public.record_type as enum (
  'yaklasik_maliyet',
  'dogrudan_temin',
  'ihale_siparisi',   -- ileride
  'genel_siparis'     -- ileride
);

-- YM:  acik -> onaylandi | reddedildi   (yalnızca takip amaçlı)
-- DT:  arama_bekliyor -> arandi -> onaylandi | reddedildi
create type public.record_status as enum (
  'acik',
  'arama_bekliyor',
  'arandi',
  'onaylandi',
  'reddedildi'
);

create type public.shipment_status as enum ('sevk_bekliyor', 'teslim_edildi');
create type public.incoming_status as enum ('bekliyor', 'teslim_alindi');

-- ---------------------------------------------------------------------------
-- Profiller (auth.users ile 1-1)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'is_admin')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin and active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Satış kayıtları
-- ---------------------------------------------------------------------------

create table public.records (
  id uuid primary key default gen_random_uuid(),
  type public.record_type not null,
  status public.record_status not null,
  record_date date not null default current_date,
  file_no text,                 -- Dosya / ihale numarası
  hospital text not null,
  contact_name text,
  contact_phone text,
  contact_ext text,                       -- sabit hatta dahili numara
  notes text,
  source_record_id uuid references public.records (id) on delete set null,
  converted_record_id uuid references public.records (id) on delete set null,
  result_at timestamptz,
  result_note text,
  last_reminded_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_status_matches_type check (
    (type = 'yaklasik_maliyet' and status in ('acik', 'onaylandi', 'reddedildi'))
    or (type = 'dogrudan_temin' and status in ('arama_bekliyor', 'arandi', 'onaylandi', 'reddedildi'))
    or (type in ('ihale_siparisi', 'genel_siparis'))
  )
);

create index records_date_idx on public.records (record_date desc, created_at desc);
create index records_status_idx on public.records (type, status);

create table public.record_lines (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  sort_order int not null default 0,
  product_name text not null,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit text not null default 'Adet',
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  approved boolean,              -- null: sonuç girilmedi
  approved_qty numeric(14, 2) check (approved_qty is null or approved_qty >= 0),
  created_at timestamptz not null default now()
);

create index record_lines_record_idx on public.record_lines (record_id, sort_order);

create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  keep_reminding boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index call_logs_record_idx on public.call_logs (record_id, created_at desc);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  status public.shipment_status not null default 'sevk_bekliyor',
  note text,
  planned_date date not null default current_date,   -- planlanan sevk tarihi (sevkiyat programı)
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index shipments_status_idx on public.shipments (status, planned_date);
create index shipments_record_idx on public.shipments (record_id);

create table public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  line_id uuid not null references public.record_lines (id) on delete cascade,
  quantity numeric(14, 2) not null check (quantity > 0)
);

create index shipment_items_line_idx on public.shipment_items (line_id);

-- Gelecek sevkiyatlar: tedarikçiden bize gelecek ürünler.
create table public.incoming_shipments (
  id uuid primary key default gen_random_uuid(),
  supplier text not null check (length(trim(supplier)) > 0),
  product_details text not null check (length(trim(product_details)) > 0),
  quantity numeric(14, 2) check (quantity is null or quantity > 0),  -- belli değilse boş
  unit text,
  expected_date date not null default current_date,
  note text,
  status public.incoming_status not null default 'bekliyor',
  received_at timestamptz,
  received_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index incoming_shipments_status_idx on public.incoming_shipments (status, expected_date);

-- Görüşmeler: çalışanların hastane ziyaret notları. Herkes görür, herkes düzeltebilir.
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  hospital text not null check (length(trim(hospital)) > 0),
  department text not null check (length(trim(department)) > 0),
  note text not null check (length(trim(note)) > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz
);

create index meetings_date_idx on public.meetings (meeting_date desc, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger records_touch before update on public.records
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Kalem bazında ilerleme: toplam (onaylanan) / sevkte / teslim / kalan
-- ---------------------------------------------------------------------------

create view public.line_progress
with (security_invoker = true)
as
select
  l.id as line_id,
  l.record_id,
  coalesce(l.approved_qty, 0) as approved_qty,
  coalesce(sum(si.quantity) filter (where s.status = 'sevk_bekliyor'), 0) as in_shipment,
  coalesce(sum(si.quantity) filter (where s.status = 'teslim_edildi'), 0) as delivered,
  coalesce(l.approved_qty, 0) - coalesce(sum(si.quantity), 0) as remaining
from public.record_lines l
left join public.shipment_items si on si.line_id = l.id
left join public.shipments s on s.id = si.shipment_id
group by l.id;

-- Sevk miktarı onaylanan miktarı aşamaz
create or replace function public.check_shipment_item_qty()
returns trigger
language plpgsql
as $$
declare
  v_approved numeric;
  v_used numeric;
begin
  select coalesce(approved_qty, 0) into v_approved
  from public.record_lines where id = new.line_id and approved is true;

  if v_approved is null then
    raise exception 'Bu kalem onaylanmamış, sevk edilemez.';
  end if;

  select coalesce(sum(quantity), 0) into v_used
  from public.shipment_items
  where line_id = new.line_id and id <> new.id;

  if v_used + new.quantity > v_approved then
    raise exception 'Sevk miktarı kalan onaylı miktarı aşıyor (kalan: %).', v_approved - v_used;
  end if;
  return new;
end;
$$;

create trigger shipment_items_qty before insert or update on public.shipment_items
  for each row execute function public.check_shipment_item_qty();

-- ---------------------------------------------------------------------------
-- İş akışı fonksiyonları (tek transaction içinde)
-- ---------------------------------------------------------------------------

-- Kayıt + kalemleri birlikte oluşturur / günceller.
-- p_lines: [{product_name, quantity, unit, unit_price, currency}]
create or replace function public.save_record(
  p_id uuid,
  p_type public.record_type,
  p_record_date date,
  p_file_no text,
  p_hospital text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_ext text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_line jsonb;
  v_i int := 0;
  v_status public.record_status;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün kalemi girilmelidir.';
  end if;

  if v_id is null then
    v_status := case p_type when 'yaklasik_maliyet' then 'acik'::public.record_status
                            when 'dogrudan_temin' then 'arama_bekliyor'::public.record_status end;
    if v_status is null then
      raise exception 'Bu satış tipi henüz desteklenmiyor.';
    end if;
    insert into records (type, status, record_date, file_no, hospital, contact_name, contact_phone, contact_ext, notes)
    values (p_type, v_status, p_record_date, nullif(trim(p_file_no), ''), trim(p_hospital),
            nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''), nullif(trim(p_contact_ext), ''),
            nullif(trim(p_notes), ''))
    returning id into v_id;
  else
    if exists (select 1 from records where id = v_id and status in ('onaylandi', 'reddedildi')) then
      raise exception 'Sonuçlanmış kayıtların kalemleri değiştirilemez.';
    end if;
    update records set
      record_date = p_record_date,
      file_no = nullif(trim(p_file_no), ''),
      hospital = trim(p_hospital),
      contact_name = nullif(trim(p_contact_name), ''),
      contact_phone = nullif(trim(p_contact_phone), ''),
      contact_ext = nullif(trim(p_contact_ext), ''),
      notes = nullif(trim(p_notes), '')
    where id = v_id;
    if not found then
      raise exception 'Kayıt bulunamadı.';
    end if;
    delete from record_lines where record_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into record_lines (record_id, sort_order, product_name, quantity, unit, unit_price, currency)
    values (
      v_id, v_i,
      trim(v_line ->> 'product_name'),
      (v_line ->> 'quantity')::numeric,
      coalesce(nullif(trim(v_line ->> 'unit'), ''), 'Adet'),
      (v_line ->> 'unit_price')::numeric,
      coalesce(nullif(v_line ->> 'currency', ''), 'TRY')
    );
    v_i := v_i + 1;
  end loop;

  return v_id;
end;
$$;

-- Arama notu. keep_reminding=false ise hatırlatmalar durur.
create or replace function public.log_call(p_record_id uuid, p_note text, p_keep_reminding boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into call_logs (record_id, note, keep_reminding)
  values (p_record_id, trim(p_note), coalesce(p_keep_reminding, false));

  update records
  set status = case when p_keep_reminding then 'arama_bekliyor'::public.record_status
                    else 'arandi'::public.record_status end,
      last_reminded_at = case when p_keep_reminding then now() else last_reminded_at end
  where id = p_record_id
    and type = 'dogrudan_temin'
    and status in ('arama_bekliyor', 'arandi');
end;
$$;

-- DT sonucu (ilk giriş veya sonradan düzeltme).
-- p_lines (onayda): [{line_id, approved_qty}] — listede olmayan kalemler reddedilmiş sayılır.
-- Sevkiyata aktarılmış miktarın altına inilemez.
create or replace function public.set_dt_result(
  p_record_id uuid,
  p_approved boolean,
  p_note text,
  p_lines jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line jsonb;
  v_qty numeric;
  v_max numeric;
  v_product text;
  v_shipped numeric;
begin
  if not exists (
    select 1 from records
    where id = p_record_id and type = 'dogrudan_temin'
      and status in ('arama_bekliyor', 'arandi', 'onaylandi', 'reddedildi')
  ) then
    raise exception 'Bu kayıt için sonuç girilemez.';
  end if;

  if p_approved then
    if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
      raise exception 'Onaylanan en az bir kalem seçilmelidir.';
    end if;
    update record_lines set approved = false, approved_qty = null where record_id = p_record_id;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      v_qty := (v_line ->> 'approved_qty')::numeric;
      select quantity into v_max from record_lines
      where id = (v_line ->> 'line_id')::uuid and record_id = p_record_id;
      if v_max is null then
        raise exception 'Kalem bulunamadı.';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Onaylanan miktar sıfırdan büyük olmalıdır.';
      end if;
      update record_lines set approved = true, approved_qty = v_qty
      where id = (v_line ->> 'line_id')::uuid;
    end loop;
  else
    update record_lines set approved = false, approved_qty = null where record_id = p_record_id;
  end if;

  select l.product_name, coalesce(sum(si.quantity), 0)
  into v_product, v_shipped
  from record_lines l
  join shipment_items si on si.line_id = l.id
  where l.record_id = p_record_id
  group by l.id, l.product_name, l.approved_qty
  having coalesce(sum(si.quantity), 0) > coalesce(l.approved_qty, 0)
  limit 1;
  if v_product is not null then
    raise exception '% için % sevkiyata aktarılmış. Onaylanan miktar bunun altına inemez; gerekirse önce sevkiyatı iptal edin.',
      v_product, v_shipped;
  end if;

  update records
  set status = case when p_approved then 'onaylandi'::public.record_status
                    else 'reddedildi'::public.record_status end,
      result_at = now(),
      result_note = nullif(trim(p_note), '')
  where id = p_record_id;
end;
$$;

-- Sevkiyat talebi. p_items: [{line_id, quantity}]
create or replace function public.create_shipment(p_record_id uuid, p_note text, p_items jsonb, p_planned_date date default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
begin
  if not exists (select 1 from records where id = p_record_id and status = 'onaylandi') then
    raise exception 'Sadece onaylanmış kayıtlar sevk edilebilir.';
  end if;

  insert into shipments (record_id, note, planned_date)
  values (p_record_id, nullif(trim(p_note), ''), coalesce(p_planned_date, current_date))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (v_item ->> 'quantity')::numeric > 0 then
      if not exists (
        select 1 from record_lines where id = (v_item ->> 'line_id')::uuid and record_id = p_record_id
      ) then
        raise exception 'Kalem bu kayda ait değil.';
      end if;
      insert into shipment_items (shipment_id, line_id, quantity)
      values (v_id, (v_item ->> 'line_id')::uuid, (v_item ->> 'quantity')::numeric);
    end if;
  end loop;

  if not exists (select 1 from shipment_items where shipment_id = v_id) then
    raise exception 'Sevk edilecek en az bir kalem için miktar girilmelidir.';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: şimdilik aktif her kullanıcı her işi yapabilir; kullanıcı yönetimi adminde.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.record_lines enable row level security;
alter table public.call_logs enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.incoming_shipments enable row level security;
alter table public.meetings enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles_read" on public.profiles
  for select to authenticated using (public.is_active_user());
create policy "profiles_admin_write" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "records_all" on public.records
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "record_lines_all" on public.record_lines
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "call_logs_all" on public.call_logs
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "shipments_all" on public.shipments
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "shipment_items_all" on public.shipment_items
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "incoming_shipments_all" on public.incoming_shipments
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "meetings_all" on public.meetings
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- Push aboneliği: herkes yalnızca kendi aboneliğini görür/yönetir.
-- Gönderim sunucuda service role ile yapılır.
create policy "push_own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.line_progress to authenticated;
