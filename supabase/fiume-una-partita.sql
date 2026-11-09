-- «Riprendiamoci Fiume!»: una sola partita per account (per turno) e risultato rivedibile.
-- Da eseguire una volta in Supabase DOPO fiume-classifica.sql: SQL Editor → New query → incolla tutto → Run.
--
-- La partita viene registrata quando si preme «Inizia» (0 punti) e completata una sola volta alla fine,
-- con le risposte date: così chi chiude la pagina a metà non può ricominciare dopo aver visto le parole.

alter table public.mg_fiume_plays add column if not exists answers jsonb not null default '[]';
alter table public.mg_fiume_plays add column if not exists finished_at timestamptz;
-- le partite registrate prima di questo aggiornamento erano già concluse
update public.mg_fiume_plays set finished_at = created_at where finished_at is null and answers = '[]'::jsonb;

drop policy if exists "Completa la propria partita una volta" on public.mg_fiume_plays;
create policy "Completa la propria partita una volta" on public.mg_fiume_plays for update
  using (auth.uid() = user_id and finished_at is null)
  with check (auth.uid() = user_id and finished_at is not null);
