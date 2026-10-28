-- Erenos Mobile — ilk şema
-- Satış kayıtları (Yaklaşık Maliyet, Doğrudan Temin, İhale, Genel Satış), ürün kalemleri,
-- arama notları, sevkiyatlar, push abonelikleri ve kullanıcı profilleri.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipler
-- ---------------------------------------------------------------------------

create type public.record_type as enum (
  'yaklasik_maliyet',
  'dogrudan_temin',
  'ihale_siparisi',   -- arayüzde "İhale"
  'genel_siparis'     -- arayüzde "Genel Satış"
);

-- YM:  acik -> onaylandi | reddedildi   (yalnızca takip amaçlı)
-- DT:  arama_bekliyor -> arandi -> onaylandi | reddedildi
--      Hastane sonuçtan önce numune isteyebilir (isteğe bağlı adım):
--      arama_bekliyor | arandi -> numune_istendi -> numune_gonderildi -> onaylandi | reddedildi
-- İhale: ihale_bekliyor -> [numune_istendi -> numune_gonderildi] -> onaylandi (sözleşme) | reddedildi
--      Fiyatlar ihale öncesi girilir, rakip fiyatları ihaleden sonra; onaylananlar sözleşmeli kalemlerdir.
-- GS:  acik -> onaylandi             (sipariş zaten alınmıştır; reddedilmez, aranmaz)
create type public.record_status as enum (
  'acik',
  'ihale_bekliyor',
  'arama_bekliyor',
  'arandi',
  'numune_istendi',
  'numune_gonderildi',
  'onaylandi',
  'reddedildi'
);

create type public.shipment_status as enum ('sevk_bekliyor', 'teslim_edildi');
create type public.manual_direction as enum ('gelecek', 'gidecek');
create type public.manual_status as enum ('bekliyor', 'tamamlandi');

-- ---------------------------------------------------------------------------
-- Profiller (auth.users ile 1-1)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  is_admin boolean not null default false,
  active boolean not null default true,
  extended_hours boolean not null default false,  -- anımsatıcıları 08:00–22:00 arasında (her gün) al
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
  sample_requested_at timestamptz,        -- numune istendiği an (DT)
  sample_note text,
  sample_sent_at timestamptz,             -- numune gönderildiği an
  sample_sent_by uuid references public.profiles (id) on delete set null,
  -- İhale: record_date ihale tarihi, tender_time ihale saati (girilmezse 09:00).
  tender_time time,
  guarantee_paid_at timestamptz,          -- teminat yatırıldı
  guarantee_paid_by uuid references public.profiles (id) on delete set null,
  prices_entered_at timestamptz,          -- verdiğimiz fiyatlar girildi
  contract_start date,                    -- sözleşme imza tarihi
  contract_end date,                      -- hastanenin tüm ürünleri alacağı son tarih
  contract_alarm_sent_at timestamptz,     -- son ay bildirimi gönderildi
  last_reminded_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_status_matches_type check (
    (type = 'yaklasik_maliyet' and status in ('acik', 'onaylandi', 'reddedildi'))
    or (type = 'dogrudan_temin' and status in ('arama_bekliyor', 'arandi', 'numune_istendi', 'numune_gonderildi', 'onaylandi', 'reddedildi'))
    or (type = 'genel_siparis' and status in ('acik', 'onaylandi'))
    or (type = 'ihale_siparisi' and status in ('ihale_bekliyor', 'numune_istendi', 'numune_gonderildi', 'onaylandi', 'reddedildi'))
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
  unit_price numeric(14, 4) check (unit_price is null or unit_price >= 0),  -- ihalede fiyat sonradan girilir
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  approved boolean,              -- null: sonuç girilmedi
  approved_qty numeric(14, 2) check (approved_qty is null or approved_qty >= 0),
  contract_qty numeric(14, 2),   -- ihale: sözleşmedeki ilk miktar (iş artışı/eksiltmesi en fazla %20)
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

-- DT'de hastanenin istediği numuneler. Kayıt düzenlenince kalemler yeniden yazıldığı için ürün adı ve birim
-- burada ayrıca saklanır.
create table public.sample_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  sort_order int not null default 0,
  product_name text not null check (length(trim(product_name)) > 0),
  quantity numeric(14, 2) not null check (quantity > 0),
  unit text not null default 'Adet'
);

create index sample_items_record_idx on public.sample_items (record_id, sort_order);

-- İhaleye katılan rakip firmaların kalem bazında fiyatları (karşılaştırma için).
create table public.tender_bids (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  line_id uuid not null references public.record_lines (id) on delete cascade,
  company text not null check (length(trim(company)) > 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),
  currency text not null default 'TRY' check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (line_id, company)
);

create index tender_bids_record_idx on public.tender_bids (record_id);

-- Sözleşmeli ihalede iş artışı / eksiltmesi geçmişi.
create table public.contract_adjustments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  line_id uuid not null references public.record_lines (id) on delete cascade,
  old_qty numeric(14, 2) not null,
  new_qty numeric(14, 2) not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index contract_adjustments_record_idx on public.contract_adjustments (record_id, created_at desc);

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

-- Elle eklenen sevkiyatlar (Sevkiyat sayfasındaki + Ekle):
--   gelecek: tedarikçiden bize gelecek ürünler (party = tedarikçi, due_date = beklenen tarih, tamamlandi = teslim alındı)
--   gidecek: doğrudan temine bağlı olmayan, hastaneye/alıcıya gidecek ürünler (party = alıcı, due_date = sevk tarihi,
--            tamamlandi = teslim edildi). Doğrudan teminden aktarılanlar shipments tablosundadır.
create table public.manual_shipments (
  id uuid primary key default gen_random_uuid(),
  direction public.manual_direction not null,
  party text not null check (length(trim(party)) > 0),
  product_details text not null check (length(trim(product_details)) > 0),
  quantity numeric(14, 2) not null check (quantity > 0),
  unit text not null default 'Adet',
  due_date date not null default current_date,
  note text,
  status public.manual_status not null default 'bekliyor',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index manual_shipments_status_idx on public.manual_shipments (status, due_date);

-- Elle eklenen sevkiyatta parça parça teslim (miktarı girilmiş sevkiyatlar için).
-- Kalan = manual_shipments.quantity - sum(quantity); kalan sıfıra inince sevkiyat tamamlanır.
create table public.manual_shipment_deliveries (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.manual_shipments (id) on delete cascade,
  quantity numeric(14, 2) not null check (quantity > 0),
  delivered_by uuid references public.profiles (id) on delete set null default auth.uid(),
  delivered_at timestamptz not null default now()
);

create index manual_shipment_deliveries_shipment_idx on public.manual_shipment_deliveries (shipment_id, delivered_at);

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
  p_lines jsonb,
  p_tender_time time default null
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
  v_type public.record_type := p_type;
  v_line_id uuid;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün kalemi girilmelidir.';
  end if;

  if v_id is null then
    v_status := case p_type when 'yaklasik_maliyet' then 'acik'::public.record_status
                            when 'dogrudan_temin' then 'arama_bekliyor'::public.record_status
                            when 'genel_siparis' then 'acik'::public.record_status
                            when 'ihale_siparisi' then 'ihale_bekliyor'::public.record_status end;
    if v_status is null then
      raise exception 'Bu satış tipi henüz desteklenmiyor.';
    end if;
    insert into records (type, status, record_date, tender_time, file_no, hospital, contact_name, contact_phone, contact_ext, notes)
    values (p_type, v_status, p_record_date,
            case when p_type = 'ihale_siparisi' then coalesce(p_tender_time, '09:00'::time) end,
            nullif(trim(p_file_no), ''), trim(p_hospital),
            nullif(trim(p_contact_name), ''), nullif(trim(p_contact_phone), ''), nullif(trim(p_contact_ext), ''),
            nullif(trim(p_notes), ''))
    returning id into v_id;
  else
    if exists (select 1 from records where id = v_id and status in ('onaylandi', 'reddedildi')) then
      raise exception 'Sonuçlanmış kayıtların kalemleri değiştirilemez.';
    end if;
    update records set
      record_date = p_record_date,
      tender_time = case when type = 'ihale_siparisi' then coalesce(p_tender_time, '09:00'::time) end,
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
    select type into v_type from records where id = v_id;
    -- Kalemler kimlikleriyle güncellenir (rakip fiyatları vb. kaleme bağlı kalır); listeden çıkarılanlar silinir.
    delete from record_lines
    where record_id = v_id
      and id not in (select (x ->> 'id')::uuid from jsonb_array_elements(p_lines) x where coalesce(x ->> 'id', '') <> '');
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_type <> 'ihale_siparisi' and coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'Birim fiyat girilmelidir.';
    end if;
    v_line_id := null;
    if coalesce(v_line ->> 'id', '') <> '' then
      update record_lines set
        sort_order = v_i,
        product_name = trim(v_line ->> 'product_name'),
        quantity = (v_line ->> 'quantity')::numeric,
        unit = coalesce(nullif(trim(v_line ->> 'unit'), ''), 'Adet'),
        -- ihalede fiyat bu formdan değil "Fiyatlarımızı gir" adımından gelir
        unit_price = case when v_type = 'ihale_siparisi' then unit_price else (v_line ->> 'unit_price')::numeric end,
        currency = case when v_type = 'ihale_siparisi' then currency else coalesce(nullif(v_line ->> 'currency', ''), 'TRY') end
      where id = (v_line ->> 'id')::uuid and record_id = v_id
      returning id into v_line_id;
    end if;
    if v_line_id is null then
      insert into record_lines (record_id, sort_order, product_name, quantity, unit, unit_price, currency)
      values (
        v_id, v_i,
        trim(v_line ->> 'product_name'),
        (v_line ->> 'quantity')::numeric,
        coalesce(nullif(trim(v_line ->> 'unit'), ''), 'Adet'),
        case when v_type = 'ihale_siparisi' then null else (v_line ->> 'unit_price')::numeric end,
        coalesce(nullif(v_line ->> 'currency', ''), 'TRY')
      );
    end if;
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

-- Numune talebi (ilk giriş ya da numune gönderilmeden önce düzeltme).
-- p_items: [{product_name, quantity, unit}]. Talep girilince arama hatırlatması yerine numune hatırlatması başlar.
create or replace function public.request_sample(p_record_id uuid, p_note text, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_i int := 0;
begin
  if not exists (
    select 1 from records
    where id = p_record_id
      and ((type = 'dogrudan_temin' and status in ('arama_bekliyor', 'arandi', 'numune_istendi'))
        or (type = 'ihale_siparisi' and status in ('ihale_bekliyor', 'numune_istendi')))
  ) then
    raise exception 'Bu kayıt için numune talebi girilemez.';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'İstenen en az bir numune seçilmelidir.';
  end if;

  delete from sample_items where record_id = p_record_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce((v_item ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'Numune miktarı sıfırdan büyük olmalıdır.';
    end if;
    insert into sample_items (record_id, sort_order, product_name, quantity, unit)
    values (p_record_id, v_i, trim(v_item ->> 'product_name'), (v_item ->> 'quantity')::numeric,
            coalesce(nullif(trim(v_item ->> 'unit'), ''), 'Adet'));
    v_i := v_i + 1;
  end loop;

  update records
  set sample_requested_at = case when status = 'numune_istendi' then sample_requested_at else now() end,
      -- numune gönderilene kadar 2 saatte bir hatırlatma; ilki talepten 2 saat sonra
      last_reminded_at = case when status = 'numune_istendi' then last_reminded_at else now() end,
      sample_note = nullif(trim(p_note), ''),
      status = 'numune_istendi'
  where id = p_record_id;
end;
$$;

create or replace function public.mark_sample_sent(p_record_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update records
  set status = 'numune_gonderildi', sample_sent_at = now(), sample_sent_by = auth.uid()
  where id = p_record_id and type in ('dogrudan_temin', 'ihale_siparisi') and status = 'numune_istendi';
  if not found then
    raise exception 'Bu kayıtta gönderilmeyi bekleyen numune yok.';
  end if;
end;
$$;

-- DT / İhale / Genel Satış sonucu (ilk giriş veya sonradan düzeltme). Genel satış yalnızca onaylanır.
-- İhalede onay = sözleşme: p_contract_end zorunludur, p_contract_start imza tarihidir (boşsa bugün), onaylanan miktar sözleşme miktarı (contract_qty) olur.
-- p_lines (onayda): [{line_id, approved_qty}] — listede olmayan kalemler reddedilmiş sayılır.
-- Sevkiyata aktarılmış miktarın altına inilemez.
create or replace function public.set_result(
  p_record_id uuid,
  p_approved boolean,
  p_note text,
  p_lines jsonb,
  p_contract_end date default null,
  p_contract_start date default null
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
  v_type public.record_type;
begin
  select type into v_type from records where id = p_record_id;
  if not exists (
    select 1 from records
    where id = p_record_id
      and ((type = 'dogrudan_temin' and status in ('arama_bekliyor', 'arandi', 'numune_istendi', 'numune_gonderildi', 'onaylandi', 'reddedildi'))
        or (type = 'ihale_siparisi' and status in ('ihale_bekliyor', 'numune_istendi', 'numune_gonderildi', 'onaylandi', 'reddedildi'))
        or (type = 'genel_siparis' and status in ('acik', 'onaylandi')))
  ) then
    raise exception 'Bu kayıt için sonuç girilemez.';
  end if;
  if p_approved and v_type = 'ihale_siparisi' and p_contract_end is null then
    raise exception 'Sözleşme bitiş tarihi girilmelidir.';
  end if;
  if p_approved and v_type = 'ihale_siparisi' and p_contract_end < coalesce(p_contract_start, current_date) then
    raise exception 'Sözleşme bitiş tarihi imza tarihinden önce olamaz.';
  end if;
  if not p_approved and exists (select 1 from records where id = p_record_id and type = 'genel_siparis') then
    raise exception 'Genel satış reddedilemez.';
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
      update record_lines set approved = true, approved_qty = v_qty,
        contract_qty = case when v_type = 'ihale_siparisi' then v_qty end
      where id = (v_line ->> 'line_id')::uuid;
    end loop;
    if v_type = 'ihale_siparisi' and exists (
      select 1 from record_lines where record_id = p_record_id and approved and unit_price is null
    ) then
      raise exception 'Sözleşmeli kalemlerin fiyatı girilmemiş. Önce "Fiyatlarımızı gir" ile verdiğimiz fiyatları girin.';
    end if;
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
      result_note = nullif(trim(p_note), ''),
      contract_start = case when v_type = 'ihale_siparisi' and p_approved then coalesce(p_contract_start, current_date) end,
      contract_end = case when v_type = 'ihale_siparisi' and p_approved then p_contract_end end,
      contract_alarm_sent_at = case when contract_end is distinct from p_contract_end then null else contract_alarm_sent_at end
  where id = p_record_id;
end;
$$;

-- İhale: teminat yatırıldı (p_paid=false geri alır).
create or replace function public.set_guarantee(p_record_id uuid, p_paid boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update records
  set guarantee_paid_at = case when p_paid then now() end,
      guarantee_paid_by = case when p_paid then auth.uid() end
  where id = p_record_id and type = 'ihale_siparisi' and status not in ('onaylandi', 'reddedildi');
  if not found then
    raise exception 'Bu ihalede teminat bilgisi değiştirilemez.';
  end if;
end;
$$;

-- İhale: verdiğimiz fiyatlar. p_lines: [{line_id, unit_price, currency}] — tüm kalemler için zorunlu.
create or replace function public.set_our_prices(p_record_id uuid, p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line jsonb;
begin
  if not exists (select 1 from records where id = p_record_id and type = 'ihale_siparisi' and status not in ('onaylandi', 'reddedildi')) then
    raise exception 'Bu ihalede fiyatlar değiştirilemez.';
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'Her kalem için birim fiyat girilmelidir.';
    end if;
    update record_lines
    set unit_price = (v_line ->> 'unit_price')::numeric, currency = coalesce(nullif(v_line ->> 'currency', ''), 'TRY')
    where id = (v_line ->> 'line_id')::uuid and record_id = p_record_id;
  end loop;
  if exists (select 1 from record_lines where record_id = p_record_id and unit_price is null) then
    raise exception 'Her kalem için birim fiyat girilmelidir.';
  end if;
  update records set prices_entered_at = now() where id = p_record_id;
end;
$$;

-- İhale: bir rakip firmanın fiyatları (yeni ya da düzeltme). p_prices: [{line_id, unit_price, currency}];
-- fiyatı olmayan kalem o firmanın teklif vermediği kalemdir.
create or replace function public.save_competitor(p_record_id uuid, p_company text, p_old_company text, p_prices jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if not exists (select 1 from records where id = p_record_id and type = 'ihale_siparisi') then
    raise exception 'Kayıt bulunamadı.';
  end if;
  if length(trim(coalesce(p_company, ''))) = 0 then
    raise exception 'Firma adı gerekli.';
  end if;
  if lower(trim(p_company)) is distinct from lower(trim(coalesce(p_old_company, p_company)))
     and exists (select 1 from tender_bids where record_id = p_record_id and lower(company) = lower(trim(p_company))) then
    raise exception 'Bu firma zaten girilmiş.';
  end if;
  delete from tender_bids where record_id = p_record_id and lower(company) = lower(trim(coalesce(p_old_company, p_company)));
  for v_item in select * from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) loop
    if (v_item ->> 'unit_price') is not null then
      if (v_item ->> 'unit_price')::numeric < 0 then
        raise exception 'Fiyat sıfırdan küçük olamaz.';
      end if;
      insert into tender_bids (record_id, line_id, company, unit_price, currency)
      select p_record_id, l.id, trim(p_company), (v_item ->> 'unit_price')::numeric, coalesce(nullif(v_item ->> 'currency', ''), 'TRY')
      from record_lines l where l.id = (v_item ->> 'line_id')::uuid and l.record_id = p_record_id;
    end if;
  end loop;
  if not exists (select 1 from tender_bids where record_id = p_record_id and company = trim(p_company)) then
    raise exception 'En az bir kalem için fiyat girin.';
  end if;
end;
$$;

-- Sözleşmeli ihalede iş artışı / eksiltmesi: sözleşme miktarının en fazla %20 fazlası ya da eksiği.
create or replace function public.adjust_contract(p_line_id uuid, p_qty numeric, p_note text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_line record_lines;
  v_used numeric;
begin
  select l.* into v_line from record_lines l join records r on r.id = l.record_id
  where l.id = p_line_id and r.type = 'ihale_siparisi' and r.status = 'onaylandi' and l.approved
  for update of l;
  if not found then
    raise exception 'Bu kalemde iş artışı / eksiltmesi yapılamaz.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Miktar sıfırdan büyük olmalıdır.';
  end if;
  if p_qty > round(v_line.contract_qty * 1.2, 2) or p_qty < round(v_line.contract_qty * 0.8, 2) then
    raise exception 'Sözleşme miktarının en fazla %%20 fazlası ya da eksiği girilebilir (% ile % arası).',
      round(v_line.contract_qty * 0.8, 2), round(v_line.contract_qty * 1.2, 2);
  end if;
  select coalesce(sum(quantity), 0) into v_used from shipment_items where line_id = p_line_id;
  if p_qty < v_used then
    raise exception '% sevkiyata aktarılmış; miktar bunun altına inemez.', v_used;
  end if;
  if p_qty = v_line.approved_qty then
    return;
  end if;
  insert into contract_adjustments (record_id, line_id, old_qty, new_qty, note)
  values (v_line.record_id, p_line_id, v_line.approved_qty, p_qty, nullif(trim(p_note), ''));
  update record_lines set approved_qty = p_qty where id = p_line_id;
end;
$$;

-- Elle eklenen sevkiyata teslim kaydı. p_quantity null ise kalanın tamamı teslim sayılır. Kalan sıfıra inince sevkiyat tamamlanır. Dönen değer: true = tamamlandı.
create or replace function public.deliver_manual_shipment(p_id uuid, p_quantity numeric)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
  v_done numeric;
  v_qty numeric;
begin
  select quantity into v_total from manual_shipments where id = p_id and status = 'bekliyor' for update;
  if not found then
    raise exception 'Bu sevkiyat tamamlanmış ya da silinmiş.';
  end if;

  select coalesce(sum(quantity), 0) into v_done from manual_shipment_deliveries where shipment_id = p_id;
  v_qty := coalesce(p_quantity, v_total - v_done);
  if v_qty <= 0 then
    raise exception 'Teslim miktarı sıfırdan büyük olmalıdır.';
  end if;
  if v_done + v_qty > v_total then
    raise exception 'Teslim miktarı kalan miktarı aşıyor (kalan: %).', v_total - v_done;
  end if;
  insert into manual_shipment_deliveries (shipment_id, quantity) values (p_id, v_qty);
  if v_done + v_qty < v_total then
    return false;
  end if;

  update manual_shipments set status = 'tamamlandi', completed_at = now(), completed_by = auth.uid() where id = p_id;
  return true;
end;
$$;

-- Düzeltmede miktar, teslim edilmiş miktarın altına inemez.
create or replace function public.check_manual_shipment_qty()
returns trigger
language plpgsql
as $$
declare
  v_done numeric;
begin
  select coalesce(sum(quantity), 0) into v_done from public.manual_shipment_deliveries where shipment_id = new.id;
  if new.quantity < v_done then
    raise exception 'Bu sevkiyattan % teslim edildi. Miktar bunun altına inemez.', v_done;
  end if;
  return new;
end;
$$;

create trigger manual_shipments_qty before update of quantity on public.manual_shipments
  for each row execute function public.check_manual_shipment_qty();

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
alter table public.sample_items enable row level security;
alter table public.tender_bids enable row level security;
alter table public.contract_adjustments enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.manual_shipments enable row level security;
alter table public.manual_shipment_deliveries enable row level security;
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
create policy "sample_items_all" on public.sample_items
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "tender_bids_all" on public.tender_bids
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "contract_adjustments_all" on public.contract_adjustments
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "shipments_all" on public.shipments
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "shipment_items_all" on public.shipment_items
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "manual_shipment_deliveries_all" on public.manual_shipment_deliveries
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "manual_shipments_all" on public.manual_shipments
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "meetings_all" on public.meetings
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());

-- Push aboneliği: herkes yalnızca kendi aboneliğini görür/yönetir.
-- Gönderim sunucuda service role ile yapılır.
create policy "push_own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.line_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Anımsatıcılar: kişiye özel hatırlatmalar. Yalnızca seçilen kişilere bildirim gider;
-- her kişi kendi hesabından "Tamamladım" deyince onun bildirimleri durur.
-- ---------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  detail text,
  starts_at timestamptz not null,               -- ilk hatırlatma anı; sonrakiler starts_at + k * aralık
  interval_minutes int not null check (interval_minutes in (60, 120, 180, 240, 1440, 10080)),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.reminder_recipients (
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  done_at timestamptz,                          -- kişi tamamladı; bildirimleri durur
  last_sent_at timestamptz,                     -- son bildirim (zamanlanmış iş günceller)
  primary key (reminder_id, user_id)
);
create index reminder_recipients_user_idx on public.reminder_recipients (user_id);

-- RLS özyinelemesini önlemek için üyelik kontrolleri security definer.
create or replace function public.is_reminder_member(p_reminder_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from reminder_recipients where reminder_id = p_reminder_id and user_id = auth.uid())
$$;
create or replace function public.is_reminder_owner(p_reminder_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from reminders where id = p_reminder_id and created_by = auth.uid())
$$;

alter table public.reminders enable row level security;
alter table public.reminder_recipients enable row level security;

-- Anımsatıcıyı yalnızca oluşturan ve eklenen kişiler görür; yalnızca oluşturan düzenler/siler.
create policy "reminders_read" on public.reminders
  for select to authenticated using (public.is_active_user() and (created_by = auth.uid() or public.is_reminder_member(id)));
create policy "reminders_insert" on public.reminders
  for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
create policy "reminders_owner_update" on public.reminders
  for update to authenticated using (public.is_active_user() and created_by = auth.uid());
create policy "reminders_owner_delete" on public.reminders
  for delete to authenticated using (public.is_active_user() and created_by = auth.uid());
create policy "reminder_recipients_read" on public.reminder_recipients
  for select to authenticated using (
    public.is_active_user() and (user_id = auth.uid() or public.is_reminder_member(reminder_id) or public.is_reminder_owner(reminder_id)));
create policy "reminder_recipients_owner_write" on public.reminder_recipients
  for all to authenticated using (public.is_active_user() and public.is_reminder_owner(reminder_id))
  with check (public.is_active_user() and public.is_reminder_owner(reminder_id));

-- Anımsatıcı oluşturur / günceller. p_users: bildirim gidecek kişiler (en az biri).
-- Düzenlemede listeden çıkarılan kişiler silinir; kalanların "tamamladı" bilgisi korunur,
-- zamanlama değiştiği için son gönderim sıfırlanır.
create or replace function public.save_reminder(
  p_id uuid,
  p_title text,
  p_detail text,
  p_starts_at timestamptz,
  p_interval_minutes int,
  p_users uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Başlık girilmelidir.';
  end if;
  if coalesce(array_length(p_users, 1), 0) = 0 then
    raise exception 'Bildirim gidecek en az bir kişi seçilmelidir.';
  end if;
  if exists (select 1 from unnest(p_users) u where not exists (select 1 from profiles where id = u and active)) then
    raise exception 'Seçilen kişilerden biri bulunamadı ya da pasif.';
  end if;

  if v_id is null then
    insert into reminders (title, detail, starts_at, interval_minutes)
    values (trim(p_title), nullif(trim(p_detail), ''), p_starts_at, p_interval_minutes)
    returning id into v_id;
  else
    update reminders set title = trim(p_title), detail = nullif(trim(p_detail), ''), starts_at = p_starts_at,
      interval_minutes = p_interval_minutes, updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'Anımsatıcıyı yalnızca oluşturan kişi düzenleyebilir.';
    end if;
    delete from reminder_recipients where reminder_id = v_id and user_id <> all (p_users);
    update reminder_recipients set last_sent_at = null where reminder_id = v_id;
  end if;
  insert into reminder_recipients (reminder_id, user_id)
  select v_id, u from (select distinct unnest(p_users) as u) x
  on conflict do nothing;
  return v_id;
end;
$$;

-- Kişi kendi hesabından tamamladı (p_done=false geri alır).
create or replace function public.set_reminder_done(p_reminder_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'Yetkisiz.';
  end if;
  update reminder_recipients set done_at = case when p_done then now() end
  where reminder_id = p_reminder_id and user_id = auth.uid();
  if not found then
    raise exception 'Bu anımsatıcı size eklenmemiş.';
  end if;
end;
$$;

-- Kullanıcının kendi ayarı: anımsatıcıları mesai dışında da (her gün 08:00–22:00) al.
create or replace function public.set_extended_hours(p_on boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set extended_hours = p_on where id = auth.uid() and active;
$$;
