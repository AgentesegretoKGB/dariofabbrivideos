-- Like / non mi piace sui commenti e risposte ai commenti.
-- Da eseguire una volta in Supabase DOPO recensioni-commenti-mappe.sql: SQL Editor → New query → incolla tutto → Run.

-- Risposte: un commento può rispondere a un altro (parent_id)
alter table public.comments add column if not exists parent_id bigint references public.comments (id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

-- Voti sui commenti: +1 = mi piace, -1 = non mi piace (uno per utente per commento)
create table if not exists public.comment_votes (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);
alter table public.comment_votes enable row level security;
drop policy if exists "Voti sui commenti visibili a tutti" on public.comment_votes;
create policy "Voti sui commenti visibili a tutti" on public.comment_votes for select using (true);
drop policy if exists "Vota un commento" on public.comment_votes;
create policy "Vota un commento" on public.comment_votes for insert with check (auth.uid() = user_id);
drop policy if exists "Cambia il proprio voto sul commento" on public.comment_votes;
create policy "Cambia il proprio voto sul commento" on public.comment_votes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Togli il proprio voto sul commento" on public.comment_votes;
create policy "Togli il proprio voto sul commento" on public.comment_votes for delete using (auth.uid() = user_id);

-- Conteggi per commento
create or replace view public.comment_scores with (security_invoker = true) as
select comment_id,
       count(*) filter (where value = 1)::int as likes,
       count(*) filter (where value = -1)::int as dislikes
from public.comment_votes group by comment_id;
