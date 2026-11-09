-- Valutazioni a stelle, commenti e mappe pubblicate dagli utenti.
-- Da eseguire una volta in Supabase DOPO profili.sql: SQL Editor → New query → incolla tutto → Run.
-- item_type indica a cosa si riferisce: 'video' (item_id = id YouTube) oppure 'map' (item_id = id della mappa).

-- ---------- Valutazioni (1-5 stelle, una per utente per elemento) ----------
create table if not exists public.ratings (
  item_type text not null check (item_type in ('video', 'map')),
  item_id text not null check (char_length(item_id) between 1 and 100),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (item_type, item_id, user_id)
);
alter table public.ratings enable row level security;
drop policy if exists "Valutazioni visibili a tutti" on public.ratings;
create policy "Valutazioni visibili a tutti" on public.ratings for select using (true);
drop policy if exists "Crea la propria valutazione" on public.ratings;
create policy "Crea la propria valutazione" on public.ratings for insert with check (auth.uid() = user_id);
drop policy if exists "Modifica la propria valutazione" on public.ratings;
create policy "Modifica la propria valutazione" on public.ratings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Cancella la propria valutazione" on public.ratings;
create policy "Cancella la propria valutazione" on public.ratings for delete using (auth.uid() = user_id);

-- ---------- Commenti (serve uno username: user_id punta ai profili) ----------
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  item_type text not null check (item_type in ('video', 'map')),
  item_id text not null check (char_length(item_id) between 1 and 100),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_item_idx on public.comments (item_type, item_id, created_at desc);
alter table public.comments enable row level security;
drop policy if exists "Commenti visibili a tutti" on public.comments;
create policy "Commenti visibili a tutti" on public.comments for select using (true);
drop policy if exists "Scrive i propri commenti" on public.comments;
create policy "Scrive i propri commenti" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "Cancella i propri commenti" on public.comments;
create policy "Cancella i propri commenti" on public.comments for delete using (auth.uid() = user_id);

-- ---------- Riepilogo: media stelle, numero di voti e di commenti ----------
create or replace view public.item_stats with (security_invoker = true) as
select item_type, item_id,
       r.avg_stars,
       coalesce(r.n, 0) as ratings_count,
       coalesce(c.n, 0) as comments_count
from (select item_type, item_id, round(avg(stars)::numeric, 1) as avg_stars, count(*)::int as n
        from public.ratings group by item_type, item_id) r
full join (select item_type, item_id, count(*)::int as n
             from public.comments group by item_type, item_id) c
  using (item_type, item_id);

-- ---------- Mappe pubblicate dagli utenti ----------
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  file_path text not null,     -- progetto .json nel bucket "mappe"
  preview_path text not null,  -- anteprima .jpg nel bucket "mappe"
  created_at timestamptz not null default now()
);
create index if not exists maps_created_idx on public.maps (created_at desc);
alter table public.maps enable row level security;
drop policy if exists "Mappe visibili a tutti" on public.maps;
create policy "Mappe visibili a tutti" on public.maps for select using (true);
drop policy if exists "Pubblica le proprie mappe" on public.maps;
create policy "Pubblica le proprie mappe" on public.maps for insert with check (auth.uid() = user_id);
drop policy if exists "Cancella le proprie mappe" on public.maps;
create policy "Cancella le proprie mappe" on public.maps for delete using (auth.uid() = user_id);

-- File delle mappe: cartella pubblica "mappe", ognuno scrive solo nella sottocartella col proprio id
insert into storage.buckets (id, name, public, file_size_limit)
values ('mappe', 'mappe', true, 20971520)  -- 20 MB per file
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "Carica nella propria cartella mappe" on storage.objects;
create policy "Carica nella propria cartella mappe" on storage.objects for insert to authenticated
  with check (bucket_id = 'mappe' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Cancella dalla propria cartella mappe" on storage.objects;
create policy "Cancella dalla propria cartella mappe" on storage.objects for delete to authenticated
  using (bucket_id = 'mappe' and (storage.foldername(name))[1] = auth.uid()::text);
