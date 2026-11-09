-- Minigiochi: «Cosa dirà Fabbri?» (previsioni in stile Polymarket).
-- Da eseguire una volta in Supabase DOPO profili.sql: SQL Editor → New query → incolla tutto → Run.

-- ---------- Amministratori (possono creare eventi, gestire formule, confermare punteggi) ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "Ognuno vede se è amministratore" on public.admins;
create policy "Ognuno vede se è amministratore" on public.admins for select using (auth.uid() = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- L'account @inaz è amministratore (per aggiungerne altri: insert into admins select id from profiles where username = '...')
insert into public.admins (user_id) select id from public.profiles where username = 'inaz' on conflict do nothing;

-- ---------- Formule / modi di dire con i loro punti ----------
create table if not exists public.mg_phrases (
  id serial primary key,
  text text not null unique check (char_length(btrim(text)) between 1 and 120),
  variants text[] not null default '{}',     -- forme alternative cercate nella trascrizione (minuscole, senza accenti)
  points smallint not null check (points between 1 and 50),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mg_phrases enable row level security;
drop policy if exists "Formule visibili a tutti" on public.mg_phrases;
create policy "Formule visibili a tutti" on public.mg_phrases for select using (true);
drop policy if exists "Formule gestite dagli amministratori" on public.mg_phrases;
create policy "Formule gestite dagli amministratori" on public.mg_phrases for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Eventi ----------
create table if not exists public.mg_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  starts_at timestamptz not null,             -- a quest'ora si chiudono le schedine
  youtube_channel text,
  org_link text,
  video_id text,                              -- video YouTube collegato (se c'è)
  status text not null default 'open' check (status in ('open', 'to_review', 'confirmed')),
  detected jsonb not null default '{}',       -- conteggi trovati nella trascrizione: { "id formula": volte }
  said_ids int[] not null default '{}',       -- formule dette (provvisorie finché status <> 'confirmed')
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mg_events_start_idx on public.mg_events (starts_at desc);
alter table public.mg_events enable row level security;
drop policy if exists "Eventi visibili a tutti" on public.mg_events;
create policy "Eventi visibili a tutti" on public.mg_events for select using (true);
drop policy if exists "Eventi gestiti dagli amministratori" on public.mg_events;
create policy "Eventi gestiti dagli amministratori" on public.mg_events for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Schedine (una per giocatore per evento, da 1 a 5 formule) ----------
create table if not exists public.mg_entries (
  event_id uuid not null references public.mg_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  phrase_ids int[] not null check (cardinality(phrase_ids) between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.mg_entries enable row level security;

-- La schedina si può compilare o modificare solo prima dell'inizio dell'evento
create or replace function public.mg_event_open(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mg_events where id = e and now() < starts_at);
$$;

drop policy if exists "Schedine: la propria sempre, le altre dopo l'inizio" on public.mg_entries;
create policy "Schedine: la propria sempre, le altre dopo l'inizio" on public.mg_entries for select
  using (auth.uid() = user_id or not public.mg_event_open(event_id));
drop policy if exists "Compila la propria schedina prima dell'inizio" on public.mg_entries;
create policy "Compila la propria schedina prima dell'inizio" on public.mg_entries for insert
  with check (auth.uid() = user_id and public.mg_event_open(event_id));
drop policy if exists "Modifica la propria schedina prima dell'inizio" on public.mg_entries;
create policy "Modifica la propria schedina prima dell'inizio" on public.mg_entries for update
  using (auth.uid() = user_id and public.mg_event_open(event_id))
  with check (auth.uid() = user_id and public.mg_event_open(event_id));
drop policy if exists "Ritira la propria schedina prima dell'inizio" on public.mg_entries;
create policy "Ritira la propria schedina prima dell'inizio" on public.mg_entries for delete
  using (auth.uid() = user_id and public.mg_event_open(event_id));

-- Controllo: formule distinte, esistenti e attive
create or replace function public.mg_entries_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(distinct x) from unnest(new.phrase_ids) x) <> cardinality(new.phrase_ids) then
    raise exception 'La stessa formula è stata scelta due volte';
  end if;
  if exists (select 1 from unnest(new.phrase_ids) x where not exists (select 1 from public.mg_phrases p where p.id = x and p.active)) then
    raise exception 'Formula non valida';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists mg_entries_check on public.mg_entries;
create trigger mg_entries_check before insert or update on public.mg_entries
  for each row execute function public.mg_entries_check();

-- ---------- Punteggi (solo eventi confermati) e classifica ----------
create or replace view public.mg_scores with (security_invoker = true) as
select en.event_id, en.user_id, pr.username, en.phrase_ids,
       coalesce((select sum(p.points) from public.mg_phrases p where p.id = any (en.phrase_ids) and p.id = any (ev.said_ids)), 0)::int as points,
       (select count(*) from unnest(en.phrase_ids) x where x = any (ev.said_ids))::int as hits
from public.mg_entries en
join public.mg_events ev on ev.id = en.event_id and ev.status = 'confirmed'
join public.profiles pr on pr.id = en.user_id;

create or replace view public.mg_leaderboard with (security_invoker = true) as
select user_id, username, sum(points)::int as points, count(*)::int as events, sum(hits)::int as hits
from public.mg_scores group by user_id, username;

-- ---------- Lista iniziale delle formule (ricavata dalle trascrizioni dei video del catalogo) ----------
-- Punti in base alla rarità: più l'espressione compare in pochi video, più punti vale (da 1 a 10).
insert into public.mg_phrases (text, variants, points) values
  ('Ovviamente', array['ovviamente']::text[], 1),  -- in 326 video su 353
  ('Gli americani', array['gli americani']::text[], 1),  -- in 311 video su 353
  ('Peraltro', array['peraltro']::text[], 1),  -- in 296 video su 353
  ('Più o meno', array['piu o meno']::text[], 1),  -- in 291 video su 353
  ('Esattamente', array['esattamente']::text[], 1),  -- in 290 video su 353
  ('Eccetera', array['eccetera']::text[], 1),  -- in 287 video su 353
  ('Impero', array['imperi', 'imperiale', 'impero']::text[], 1),  -- in 280 video su 353
  ('Addirittura', array['addirittura']::text[], 1),  -- in 277 video su 353
  ('Strategico', array['strategica', 'strategicamente', 'strategiche', 'strategici', 'strategico']::text[], 1),  -- in 258 video su 353
  ('Nazione', array['nazione', 'nazioni']::text[], 1),  -- in 234 video su 353
  ('Essenzialmente', array['essenzialmente']::text[], 1),  -- in 218 video su 353
  ('Anzitutto', array['anzitutto']::text[], 1),  -- in 216 video su 353
  ('Evidentemente', array['evidentemente']::text[], 1),  -- in 200 video su 353
  ('Inevitabilmente', array['inevitabilmente']::text[], 1),  -- in 198 video su 353
  ('Una sorta di', array['una sorta di']::text[], 1),  -- in 188 video su 353
  ('Tattico', array['tattica', 'tatticamente', 'tattiche', 'tattici', 'tattico']::text[], 1),  -- in 199 video su 353
  ('Letteralmente', array['letteralmente']::text[], 2),  -- in 183 video su 353
  ('Come dire', array['come dire']::text[], 2),  -- in 175 video su 353
  ('Seconda guerra mondiale', array['seconda guerra mondiale']::text[], 2),  -- in 172 video su 353
  ('Allo stesso tempo', array['allo stesso tempo']::text[], 2),  -- in 171 video su 353
  ('Figurarsi', array['figurarsi', 'figuriamoci']::text[], 2),  -- in 167 video su 353
  ('Washington', array['washington']::text[], 2),  -- in 163 video su 353
  ('Talmente', array['talmente']::text[], 2),  -- in 159 video su 353
  ('Sciocchezze', array['sciocchezza', 'sciocchezze']::text[], 2),  -- in 157 video su 353
  ('Narrazione', array['narrazione']::text[], 2),  -- in 155 video su 353
  ('Mediamente', array['mediamente']::text[], 2),  -- in 154 video su 353
  ('Apparati', array['apparati']::text[], 2),  -- in 153 video su 353
  ('Medio Oriente', array['medio oriente']::text[], 2),  -- in 151 video su 353
  ('Guerra fredda', array['guerra fredda']::text[], 2),  -- in 151 video su 353
  ('Gli esseri umani', array['esseri umani', 'gli esseri umani']::text[], 2),  -- in 149 video su 353
  ('Storicamente', array['storicamente']::text[], 2),  -- in 145 video su 353
  ('Limes', array['limes']::text[], 2),  -- in 144 video su 353
  ('Domino', array['domino']::text[], 2),  -- in 141 video su 353
  ('Perlomeno', array['per lo meno', 'perlomeno']::text[], 2),  -- in 139 video su 353
  ('Mestiere', array['mestiere']::text[], 2),  -- in 136 video su 353
  ('Collettività', array['collettivita', 'collettivo']::text[], 2),  -- in 135 video su 353
  ('Percezione', array['percezione']::text[], 2),  -- in 135 video su 353
  ('Tantomeno', array['tanto meno', 'tantomeno']::text[], 2),  -- in 134 video su 353
  ('Non a caso', array['non a caso']::text[], 2),  -- in 133 video su 353
  ('Diciamo così', array['diciamo cosi']::text[], 2),  -- in 131 video su 353
  ('Sentimento', array['sentimento']::text[], 2),  -- in 130 video su 353
  ('Superpotenza', array['superpotenza', 'superpotenze']::text[], 2),  -- in 129 video su 353
  ('Fino in fondo', array['fino in fondo']::text[], 2),  -- in 128 video su 353
  ('Propaganda', array['propaganda']::text[], 2),  -- in 127 video su 353
  ('Sfera di influenza', array['sfera d''influenza', 'sfera di influenza', 'sfere di influenza']::text[], 2),  -- in 126 video su 353
  ('Popoli', array['popoli']::text[], 2),  -- in 122 video su 353
  ('Vale la pena', array['vale la pena']::text[], 2),  -- in 121 video su 353
  ('Demografia', array['demografia', 'demografica', 'demografico']::text[], 3),  -- in 119 video su 353
  ('Pentagono', array['pentagono']::text[], 3),  -- in 115 video su 353
  ('Da questo punto di vista', array['da questo punto di vista']::text[], 3),  -- in 114 video su 353
  ('A mio avviso', array['a mio avviso']::text[], 3),  -- in 113 video su 353
  ('Il punto è', array['il punto e']::text[], 3),  -- in 113 video su 353
  ('Intendiamoci', array['intendiamoci']::text[], 3),  -- in 106 video su 353
  ('Globalizzazione', array['globalizzazione']::text[], 3),  -- in 104 video su 353
  ('Retorica', array['retorica']::text[], 3),  -- in 104 video su 353
  ('Come si dice', array['come si dice']::text[], 3),  -- in 100 video su 353
  ('Nient''altro', array['nient''altro', 'niente altro']::text[], 3),  -- in 99 video su 353
  ('Sostanzialmente', array['sostanzialmente']::text[], 3),  -- in 96 video su 353
  ('Antropologia', array['antropologia', 'antropologica', 'antropologico']::text[], 3),  -- in 95 video su 353
  ('Egemonia', array['egemone', 'egemonia', 'egemonico']::text[], 3),  -- in 95 video su 353
  ('In giro per il mondo', array['in giro per il mondo', 'in giro per il pianeta']::text[], 3),  -- in 92 video su 353
  ('In larga parte', array['in larga parte']::text[], 3),  -- in 87 video su 353
  ('Mettiamola così', array['mettiamola cosi', 'mettiamola in questo modo']::text[], 3),  -- in 84 video su 353
  ('Non è un dettaglio', array['non e affatto un dettaglio', 'non e esattamente un dettaglio', 'non e un dettaglio']::text[], 4),  -- in 74 video su 353
  ('La fine della storia', array['fine della storia', 'la fine della storia', 'la storia e finita', 'la storia era finita', 'la storia sia finita']::text[], 4),  -- in 70 video su 353
  ('La prima potenza del pianeta', array['la prima potenza del pianeta', 'prima potenza al mondo', 'prima potenza del mondo', 'prima potenza del pianeta']::text[], 4),  -- in 66 video su 353
  ('Chiacchiere', array['chiacchiere']::text[], 4),  -- in 63 video su 353
  ('Per due ragioni', array['per due motivi', 'per due ragioni']::text[], 4),  -- in 60 video su 353
  ('Pedagogia', array['pedagogia', 'pedagogica', 'pedagogico']::text[], 4),  -- in 55 video su 353
  ('Fino a un certo punto', array['fino a un certo punto', 'fino ad un certo punto']::text[], 4),  -- in 51 video su 353
  ('Noi italiani', array['noi italiani']::text[], 5),  -- in 50 video su 353
  ('Questo è un altro discorso', array['e un altro discorso', 'questo e un altro discorso']::text[], 5),  -- in 50 video su 353
  ('Geopolitica umana', array['geopolitica umana']::text[], 5),  -- in 47 video su 353
  ('Età media', array['eta media']::text[], 5),  -- in 47 video su 353
  ('Se ne può discutere', array['se ne puo discutere']::text[], 5),  -- in 46 video su 353
  ('Al di là delle chiacchiere', array['al di la delle chiacchiere']::text[], 5),  -- in 44 video su 353
  ('Di che cosa stiamo parlando', array['di che cosa stiamo parlando', 'di cosa stiamo parlando']::text[], 5),  -- in 42 video su 353
  ('Questo per dire che', array['questo per dire che']::text[], 5),  -- in 41 video su 353
  ('Mi permetto', array['mi permetto']::text[], 5),  -- in 41 video su 353
  ('Non è questo il punto', array['non e questo il punto']::text[], 5),  -- in 41 video su 353
  ('Postura', array['postura']::text[], 5),  -- in 41 video su 353
  ('Nei libri di storia', array['nei libri di storia', 'sui libri di storia']::text[], 5),  -- in 39 video su 353
  ('Il paese più anziano del mondo', array['il paese piu anziano del mondo', 'paese piu anziano del mondo', 'paese piu vecchio del mondo']::text[], 5),  -- in 39 video su 353
  ('Siamo in un ambito', array['siamo in un ambito']::text[], 5),  -- in 39 video su 353
  ('Sistema di istruzione', array['sistema d''istruzione', 'sistema di istruzione']::text[], 5),  -- in 38 video su 353
  ('Dal loro punto di vista', array['dal loro punto di vista']::text[], 5),  -- in 37 video su 353
  ('Nel momento stesso in cui', array['nel momento stesso in cui']::text[], 5),  -- in 35 video su 353
  ('Per rispondere alla tua domanda', array['per rispondere alla domanda', 'per rispondere alla tua domanda']::text[], 6),  -- in 30 video su 353
  ('Per così dire', array['per cosi dire']::text[], 6),  -- in 28 video su 353
  ('Impero americano', array['impero americano']::text[], 6),  -- in 26 video su 353
  ('Non ce ne rendiamo conto', array['non ce ne accorgiamo', 'non ce ne rendiamo conto']::text[], 6),  -- in 26 video su 353
  ('Il continente più importante del mondo', array['continente piu importante del mondo', 'il continente piu importante del mondo']::text[], 6),  -- in 23 video su 353
  ('Con le spalle al muro', array['con le spalle al muro']::text[], 7),  -- in 21 video su 353
  ('Ne sono convinto', array['ne sono convinto', 'sono convinto']::text[], 7),  -- in 16 video su 353
  ('Sud globale', array['sud globale']::text[], 8),  -- in 13 video su 353
  ('Baricentro', array['baricentro']::text[], 9),  -- in 8 video su 353
  ('Pax americana', array['pax americana']::text[], 10)  -- in 5 video su 353
on conflict (text) do nothing;
