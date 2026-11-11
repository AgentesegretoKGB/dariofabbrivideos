-- Calendario: eventi pubblicati dall'amministratore e segnalazioni del pubblico.
-- Da eseguire una volta in Supabase DOPO minigiochi.sql (serve la funzione is_admin):
-- SQL Editor → New query → incolla tutto → Run.

-- ---------- Eventi del calendario (visibili a tutti, gestiti dagli amministratori) ----------
create table if not exists public.cal_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  place text check (char_length(place) <= 200),
  day date not null,
  time time,                                   -- orario d'inizio (facoltativo)
  description text check (char_length(description) <= 2000),
  link text check (char_length(link) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists cal_events_day_idx on public.cal_events (day);
alter table public.cal_events enable row level security;
drop policy if exists "Eventi del calendario visibili a tutti" on public.cal_events;
create policy "Eventi del calendario visibili a tutti" on public.cal_events for select using (true);
drop policy if exists "Eventi del calendario gestiti dagli amministratori" on public.cal_events;
create policy "Eventi del calendario gestiti dagli amministratori" on public.cal_events for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Segnalazioni del pubblico (le vede solo l'amministratore: contengono l'email) ----------
create table if not exists public.cal_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  place text check (char_length(place) <= 200),
  day date not null,
  time time,
  description text check (char_length(description) <= 2000),
  link text check (char_length(link) <= 500),
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists cal_reports_created_idx on public.cal_reports (created_at desc);
alter table public.cal_reports enable row level security;
drop policy if exists "Chiunque può segnalare un evento" on public.cal_reports;
create policy "Chiunque può segnalare un evento" on public.cal_reports for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));
drop policy if exists "Segnalazioni gestite dagli amministratori" on public.cal_reports;
create policy "Segnalazioni gestite dagli amministratori" on public.cal_reports for all
  using (public.is_admin()) with check (public.is_admin());

-- Nota: il pubblico può inserire una segnalazione ma non rileggerla; per questo il sito la invia
-- senza chiedere indietro la riga creata.
