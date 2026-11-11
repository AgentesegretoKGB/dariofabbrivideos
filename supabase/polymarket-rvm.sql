-- Polymarket: seconda sezione della schedina, «Da quale TV arrivano gli RVM?».
-- Da eseguire una volta in Supabase DOPO minigiochi.sql: SQL Editor → New query → incolla tutto → Run.
--
-- Il giocatore sceglie UNA televisione; in revisione l'amministratore segna da quali TV
-- sono arrivati davvero gli RVM (anche più di una). Se la scelta è tra queste: +5 punti.

-- Televisioni possibili (codici usati dal sito)
create or replace function public.mg_rvm_valid(x text) returns boolean language sql immutable as $$
  select x in ('svedese', 'rumena', 'olandese', 'cinese', 'bbc', 'iraniana', 'danese',
               'australiana', 'tedesca', 'albanese', 'francese', 'belga', 'lettone');
$$;

alter table public.mg_entries add column if not exists rvm_guess text;
alter table public.mg_entries drop constraint if exists mg_entries_rvm_guess_check;
alter table public.mg_entries add constraint mg_entries_rvm_guess_check check (rvm_guess is null or public.mg_rvm_valid(rvm_guess));

-- Ora si può giocare anche solo la sezione RVM: da 0 a 5 formule, purché ci sia almeno una scelta
alter table public.mg_entries drop constraint if exists mg_entries_phrase_ids_check;
alter table public.mg_entries drop constraint if exists mg_entries_scelta_check;
alter table public.mg_entries add constraint mg_entries_scelta_check
  check (cardinality(phrase_ids) <= 5 and (cardinality(phrase_ids) >= 1 or rvm_guess is not null));

alter table public.mg_events add column if not exists rvm_sources text[] not null default '{}';
alter table public.mg_events drop constraint if exists mg_events_rvm_sources_check;
alter table public.mg_events add constraint mg_events_rvm_sources_check
  check (rvm_sources <@ array['svedese','rumena','olandese','cinese','bbc','iraniana','danese','australiana','tedesca','albanese','francese','belga','lettone']::text[]);

-- Punteggi: formule indovinate + 5 punti se la TV degli RVM è giusta (colonne nuove in fondo)
create or replace view public.mg_scores with (security_invoker = true) as
select en.event_id, en.user_id, pr.username, en.phrase_ids,
       (coalesce((select sum(p.points) from public.mg_phrases p where p.id = any (en.phrase_ids) and p.id = any (ev.said_ids)), 0)
        + case when en.rvm_guess is not null and en.rvm_guess = any (ev.rvm_sources) then 5 else 0 end)::int as points,
       (select count(*) from unnest(en.phrase_ids) x where x = any (ev.said_ids))::int as hits,
       en.rvm_guess,
       (en.rvm_guess is not null and en.rvm_guess = any (ev.rvm_sources)) as rvm_hit
from public.mg_entries en
join public.mg_events ev on ev.id = en.event_id and ev.status = 'confirmed'
join public.profiles pr on pr.id = en.user_id;
