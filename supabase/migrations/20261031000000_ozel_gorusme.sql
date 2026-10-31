-- Özel görüşmeler: yalnızca admin kullanıcılar görür ve ekler. Görüşme notunu yalnızca giren kişi düzenler / siler.

alter table public.meetings add column if not exists private boolean not null default false;

drop policy if exists "meetings_all" on public.meetings;
drop policy if exists "meetings_read" on public.meetings;
drop policy if exists "meetings_insert" on public.meetings;
drop policy if exists "meetings_update" on public.meetings;
drop policy if exists "meetings_delete" on public.meetings;

-- Normal görüşmeleri herkes, özel görüşmeleri yalnızca adminler görür.
create policy "meetings_read" on public.meetings for select to authenticated
  using (public.is_active_user() and (not private or public.is_admin()));
-- Herkes kendi adına not ekler; özel notu yalnızca admin ekler.
create policy "meetings_insert" on public.meetings for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid() and (not private or public.is_admin()));
-- Düzenleme ve silme yalnızca notu girene açık.
create policy "meetings_update" on public.meetings for update to authenticated
  using (public.is_active_user() and created_by = auth.uid())
  with check (created_by = auth.uid() and (not private or public.is_admin()));
create policy "meetings_delete" on public.meetings for delete to authenticated
  using (public.is_active_user() and created_by = auth.uid());
