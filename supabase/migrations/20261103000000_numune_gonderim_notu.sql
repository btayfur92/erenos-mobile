-- "Numune gönderildi" denirken yazılan isteğe bağlı not (kargo, teslim alan vb.).
alter table public.records add column if not exists sample_sent_note text;
