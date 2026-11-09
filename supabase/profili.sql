-- Profili utente con username scelto dall'utente.
-- Da eseguire una volta in Supabase: SQL Editor → New query → incolla tutto → Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9._]{3,20}$'),   -- 3-20 caratteri: lettere minuscole, numeri, punto, trattino basso
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Gli username sono pubblici (servono per vedere se uno è già preso)
drop policy if exists "Profili visibili a tutti" on public.profiles;
create policy "Profili visibili a tutti" on public.profiles
  for select using (true);

-- Ognuno può creare e modificare solo il proprio profilo
drop policy if exists "Crea il proprio profilo" on public.profiles;
create policy "Crea il proprio profilo" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Modifica il proprio profilo" on public.profiles;
create policy "Modifica il proprio profilo" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
