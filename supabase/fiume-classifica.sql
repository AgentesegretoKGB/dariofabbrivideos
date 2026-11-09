-- «Riprendiamoci Fiume!» in classifica.
-- Da eseguire una volta in Supabase DOPO minigiochi.sql: SQL Editor → New query → incolla tutto → Run.
--
-- Conta solo la PRIMA partita di ogni giocatore per ogni «turno» (round): le parole sono sempre le
-- stesse e a fine partita si vedono le correzioni, quindi rigiocare non deve far salire in classifica.
-- Quando nel sito cambia l'elenco delle parole cambia anche il turno, e si può guadagnare di nuovo.

create table if not exists public.mg_fiume_plays (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  round text not null check (char_length(round) between 1 and 40),
  score smallint not null check (score >= 0),
  total smallint not null check (total between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, round),
  check (score <= total)
);
alter table public.mg_fiume_plays enable row level security;
drop policy if exists "Partite di Fiume visibili a tutti" on public.mg_fiume_plays;
create policy "Partite di Fiume visibili a tutti" on public.mg_fiume_plays for select using (true);
drop policy if exists "Registra la propria prima partita" on public.mg_fiume_plays;
create policy "Registra la propria prima partita" on public.mg_fiume_plays for insert with check (auth.uid() = user_id);
-- nessuna policy di update/delete: la prima partita non si può riscrivere

-- Classifica: Polymarket + Fiume (le colonne nuove sono in fondo, quelle vecchie restano uguali)
create or replace view public.mg_leaderboard with (security_invoker = true) as
with pm as (
  select user_id, sum(points)::int as points, count(*)::int as events, sum(hits)::int as hits
  from public.mg_scores group by user_id
), fi as (
  select user_id, sum(score)::int as points, count(*)::int as games
  from public.mg_fiume_plays group by user_id
)
select pr.id as user_id, pr.username,
       (coalesce(pm.points, 0) + coalesce(fi.points, 0))::int as points,
       coalesce(pm.events, 0)::int as events,
       coalesce(pm.hits, 0)::int as hits,
       coalesce(pm.points, 0)::int as polymarket_points,
       coalesce(fi.points, 0)::int as fiume_points,
       coalesce(fi.games, 0)::int as fiume_games
from public.profiles pr
left join pm on pm.user_id = pr.id
left join fi on fi.user_id = pr.id
where pm.user_id is not null or fi.user_id is not null;
