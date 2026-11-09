import { Injectable, NgZone, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export type ItemType = 'video' | 'map';

export interface ItemStats { avg: number | null; ratings: number; comments: number; }

export interface ItemComment {
  id: number;
  body: string;
  created_at: string;
  user_id: string;
  username: string | null;
  parent_id: number | null;
  likes: number;
  dislikes: number;
  myVote: number;   // 1 mi piace, -1 non mi piace, 0 nessuno
}

const key = (t: ItemType, id: string) => `${t}:${id}`;
const EMPTY: ItemStats = { avg: null, ratings: 0, comments: 0 };

/** Valutazioni a stelle e commenti (tabelle ratings, comments e vista item_stats su Supabase). */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private auth = inject(AuthService);
  private zone = inject(NgZone);

  /** false se su Supabase mancano le tabelle (supabase/recensioni-commenti-mappe.sql non ancora eseguito). */
  readonly available = signal(true);
  /** false finché su Supabase non è stato eseguito supabase/like-risposte.sql */
  readonly extrasAvailable = signal(true);
  private readonly statsMap = signal<Map<string, ItemStats>>(new Map());
  private readonly mineMap = signal<Map<string, number>>(new Map());
  private loadedStats = new Set<ItemType>();
  private loadedMine = new Set<ItemType>();
  private mineFor: string | null = null;

  constructor() {
    // Quando cambia l'utente, ricarica i suoi voti
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      if (id === this.mineFor) return;
      this.mineFor = id;
      this.loadedMine.clear();
      this.mineMap.set(new Map());
      for (const t of this.loadedStats) setTimeout(() => this.loadMine(t));
    });
  }

  stats(t: ItemType, id: string): ItemStats { return this.statsMap().get(key(t, id)) ?? EMPTY; }
  myRating(t: ItemType, id: string): number { return this.mineMap().get(key(t, id)) ?? 0; }

  private missing(e: any) { return e && (e.code === 'PGRST205' || e.code === '42P01'); }
  private fail(e: any) { if (this.missing(e)) this.zone.run(() => this.available.set(false)); }

  /** Carica in un colpo solo media e conteggi di tutti gli elementi di un tipo. */
  async loadStats(t: ItemType, force = false) {
    if (this.loadedStats.has(t) && !force) return;
    this.loadedStats.add(t);
    const c = await this.auth.client();
    const { data, error } = await c.from('item_stats').select('item_id,avg_stars,ratings_count,comments_count').eq('item_type', t).limit(5000);
    if (error) { this.fail(error); this.loadedStats.delete(t); return; }
    this.zone.run(() => this.statsMap.update(m => {
      const n = new Map(m);
      for (const r of data || []) n.set(key(t, r.item_id), { avg: r.avg_stars == null ? null : Number(r.avg_stars), ratings: r.ratings_count, comments: r.comments_count });
      return n;
    }));
    this.loadMine(t);
  }

  async loadMine(t: ItemType) {
    const uid = this.auth.user()?.id;
    if (!uid || this.loadedMine.has(t)) return;
    this.loadedMine.add(t);
    const c = await this.auth.client();
    const { data, error } = await c.from('ratings').select('item_id,stars').eq('item_type', t).eq('user_id', uid).limit(5000);
    if (error) { this.fail(error); this.loadedMine.delete(t); return; }
    this.zone.run(() => this.mineMap.update(m => {
      const n = new Map(m);
      for (const r of data || []) n.set(key(t, r.item_id), r.stars);
      return n;
    }));
  }

  private async refreshOne(t: ItemType, id: string) {
    const c = await this.auth.client();
    const { data } = await c.from('item_stats').select('avg_stars,ratings_count,comments_count').eq('item_type', t).eq('item_id', id).maybeSingle();
    this.zone.run(() => this.statsMap.update(m => {
      const n = new Map(m);
      n.set(key(t, id), data ? { avg: data.avg_stars == null ? null : Number(data.avg_stars), ratings: data.ratings_count, comments: data.comments_count } : EMPTY);
      return n;
    }));
  }

  /** Salva il voto (0 = toglie il voto). Restituisce un messaggio d'errore oppure null. */
  async rate(t: ItemType, id: string, stars: number): Promise<string | null> {
    const uid = this.auth.user()?.id;
    if (!uid) return 'Accedi per votare.';
    const c = await this.auth.client();
    const { error } = stars
      ? await c.from('ratings').upsert({ item_type: t, item_id: id, user_id: uid, stars, updated_at: new Date().toISOString() })
      : await c.from('ratings').delete().match({ item_type: t, item_id: id, user_id: uid });
    if (error) { this.fail(error); return 'Voto non salvato: ' + error.message; }
    this.zone.run(() => this.mineMap.update(m => { const n = new Map(m); stars ? n.set(key(t, id), stars) : n.delete(key(t, id)); return n; }));
    await this.refreshOne(t, id);
    return null;
  }

  async comments(t: ItemType, id: string): Promise<ItemComment[]> {
    const c = await this.auth.client();
    const q = (cols: string) => c.from('comments').select(cols)
      .eq('item_type', t).eq('item_id', id).order('created_at', { ascending: false }).limit(300);
    let { data, error } = await q('id,body,created_at,user_id,parent_id,profiles(username)');
    if (error && error.code === '42703') {   // colonna parent_id non ancora creata
      this.zone.run(() => this.extrasAvailable.set(false));
      ({ data, error } = await q('id,body,created_at,user_id,profiles(username)'));
    }
    if (error) { this.fail(error); throw error; }
    const list: ItemComment[] = (data || []).map((r: any) => ({
      id: r.id, body: r.body, created_at: r.created_at, user_id: r.user_id, username: r.profiles?.username ?? null,
      parent_id: r.parent_id ?? null, likes: 0, dislikes: 0, myVote: 0,
    }));
    if (list.length && this.extrasAvailable()) await this.attachVotes(list);
    return list;
  }

  private async attachVotes(list: ItemComment[]) {
    const c = await this.auth.client();
    const ids = list.map(x => x.id);
    const { data: scores, error } = await c.from('comment_scores').select('comment_id,likes,dislikes').in('comment_id', ids);
    if (error) { if (this.missing(error)) this.zone.run(() => this.extrasAvailable.set(false)); return; }
    const byId = new Map(list.map(x => [x.id, x]));
    for (const s of scores || []) { const x = byId.get(s.comment_id); if (x) { x.likes = s.likes; x.dislikes = s.dislikes; } }
    const uid = this.auth.user()?.id;
    if (!uid) return;
    const { data: mine } = await c.from('comment_votes').select('comment_id,value').eq('user_id', uid).in('comment_id', ids);
    for (const m of mine || []) { const x = byId.get(m.comment_id); if (x) x.myVote = m.value; }
  }

  /** Mi piace (1) / non mi piace (-1). Ripetere lo stesso voto lo toglie. Aggiorna il commento passato. */
  async voteComment(cm: ItemComment, value: 1 | -1): Promise<string | null> {
    const uid = this.auth.user()?.id;
    if (!uid) return 'Accedi per votare i commenti.';
    const c = await this.auth.client();
    const next = cm.myVote === value ? 0 : value;
    const { error } = next
      ? await c.from('comment_votes').upsert({ comment_id: cm.id, user_id: uid, value: next })
      : await c.from('comment_votes').delete().match({ comment_id: cm.id, user_id: uid });
    if (error) { if (this.missing(error)) this.zone.run(() => this.extrasAvailable.set(false)); return 'Voto non salvato: ' + error.message; }
    if (cm.myVote === 1) cm.likes--; else if (cm.myVote === -1) cm.dislikes--;
    if (next === 1) cm.likes++; else if (next === -1) cm.dislikes++;
    cm.myVote = next;
    return null;
  }

  async addComment(t: ItemType, id: string, body: string, parentId: number | null = null): Promise<string | null> {
    const uid = this.auth.user()?.id;
    if (!uid) return 'Accedi per commentare.';
    if (!this.auth.username()) return 'Scegli prima uno username nella pagina del tuo account.';
    const text = body.trim();
    if (!text) return 'Scrivi qualcosa prima di pubblicare.';
    if (text.length > 2000) return 'Il commento è troppo lungo (massimo 2000 caratteri).';
    const c = await this.auth.client();
    const row: any = { item_type: t, item_id: id, user_id: uid, body: text };
    if (parentId) row.parent_id = parentId;
    const { error } = await c.from('comments').insert(row);
    if (error) { this.fail(error); return 'Commento non pubblicato: ' + error.message; }
    await this.refreshOne(t, id);
    return null;
  }

  async deleteComment(t: ItemType, itemId: string, commentId: number): Promise<string | null> {
    const c = await this.auth.client();
    const { error } = await c.from('comments').delete().eq('id', commentId);
    if (error) return 'Commento non cancellato: ' + error.message;
    await this.refreshOne(t, itemId);
    return null;
  }
}
