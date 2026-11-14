-- Polymarket: la sezione «TV degli RVM» vale solo per gli eventi in cui è attivata
-- (casella «Sezione TV degli RVM» nella creazione evento, pensata per Il Grande Gioco).
-- Da eseguire una volta in Supabase DOPO polymarket-rvm.sql: SQL Editor → New query → incolla tutto → Run.

alter table public.mg_events add column if not exists has_rvm boolean not null default false;

-- Gli eventi già creati che si chiamano «Il Grande Gioco» tengono la sezione TV
update public.mg_events set has_rvm = true where name ilike '%grande gioco%';

-- La TV degli RVM si può scegliere solo negli eventi che hanno la sezione attiva
create or replace function public.mg_entries_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(distinct x) from unnest(new.phrase_ids) x) <> cardinality(new.phrase_ids) then
    raise exception 'La stessa formula è stata scelta due volte';
  end if;
  if exists (select 1 from unnest(new.phrase_ids) x where not exists (select 1 from public.mg_phrases p where p.id = x and p.active)) then
    raise exception 'Formula non valida';
  end if;
  if new.rvm_guess is not null and not exists (select 1 from public.mg_events e where e.id = new.event_id and e.has_rvm) then
    raise exception 'Questo evento non ha la sezione TV degli RVM';
  end if;
  new.updated_at := now();
  return new;
end $$;
