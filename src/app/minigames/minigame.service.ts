import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export interface Phrase { id: number; text: string; variants: string[]; points: number; active: boolean; }

export type EventStatus = 'open' | 'to_review' | 'confirmed';

export interface MgEvent {
  id: string;
  name: string;
  starts_at: string;
  youtube_channel: string | null;
  org_link: string | null;
  video_id: string | null;
  status: EventStatus;
  detected: { [phraseId: string]: number };
  said_ids: number[];
  rvm_sources?: string[];
  confirmed_at: string | null;
}

export interface Score { user_id: string; username: string; phrase_ids: number[]; points: number; hits: number; rvm_guess?: string | null; rvm_hit?: boolean; }

export interface Entry { phrase_ids: number[]; rvm_guess: string | null; }

/** Televisioni da cui possono arrivare gli RVM (codice → nome mostrato). */
export const RVM_TVS: { id: string; label: string }[] = [
  { id: 'svedese', label: 'TV svedese' }, { id: 'rumena', label: 'TV rumena' }, { id: 'olandese', label: 'TV olandese' },
  { id: 'cinese', label: 'TV cinese' }, { id: 'bbc', label: 'BBC' }, { id: 'iraniana', label: 'TV iraniana' },
  { id: 'danese', label: 'TV danese' }, { id: 'australiana', label: 'TV australiana' }, { id: 'tedesca', label: 'TV tedesca' },
  { id: 'albanese', label: 'TV albanese' }, { id: 'francese', label: 'TV francese' }, { id: 'belga', label: 'TV francofona belga' },
  { id: 'lettone', label: 'TV lettone' },
];
export const RVM_POINTS = 5;
export const rvmLabel = (id: string | null | undefined) => RVM_TVS.find(t => t.id === id)?.label ?? '';
export interface LeaderRow { user_id: string; username: string; points: number; events: number; hits: number; polymarket_points?: number; fiume_points?: number; fiume_games?: number; }

export const MAX_PICKS = 5;

export interface FiumeAnswerRecord { en: string; it: string[]; given: string; ok: boolean; timedOut: boolean; }
export interface FiumePlay { score: number; total: number; answers: FiumeAnswerRecord[]; finished_at: string | null; }

/** Testo «piegato» per i confronti: minuscolo, senza accenti né punteggiatura. */
export function fold(s: string): string {
  return ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

/** Forme cercate per una formula: il testo stesso più le varianti. */
export function phraseForms(p: Phrase): string[] {
  return Array.from(new Set([fold(p.text), ...(p.variants || []).map(fold)])).filter(f => f.trim());
}

/** Conta quante volte ogni formula compare in un testo (es. una trascrizione). */
export function countPhrases(text: string, phrases: Phrase[]): { [id: number]: number } {
  const t = fold(text);
  const out: { [id: number]: number } = {};
  for (const p of phrases) {
    // Forme più lunghe prima; un punto del testo conta una volta sola anche se più forme si sovrappongono
    const taken: [number, number][] = [];
    for (const f of phraseForms(p).sort((a, b) => b.length - a.length)) {
      let i = t.indexOf(f);
      while (i !== -1) {
        const end = i + f.length;
        if (!taken.some(([s, e]) => i < e - 1 && end - 1 > s)) taken.push([i, end]);
        i = t.indexOf(f, end - 1);
      }
    }
    if (taken.length) out[p.id] = taken.length;
  }
  return out;
}

export function isOpen(e: MgEvent, now = Date.now()) { return new Date(e.starts_at).getTime() > now; }

@Injectable({ providedIn: 'root' })
export class MinigameService {
  private auth = inject(AuthService);
  private db() { return this.auth.client(); }

  private err(e: any): never {
    if (e?.code === 'PGRST205' || e?.code === '42P01') throw new Error('I minigiochi non sono ancora attivi sul sito.');
    throw new Error(e?.message || String(e));
  }

  async phrases(includeInactive = false): Promise<Phrase[]> {
    const c = await this.db();
    let q = c.from('mg_phrases').select('id,text,variants,points,active').order('text');
    if (!includeInactive) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) this.err(error);
    return data as Phrase[];
  }

  async events(): Promise<MgEvent[]> {
    const c = await this.db();
    const { data, error } = await c.from('mg_events').select('*').order('starts_at', { ascending: false }).limit(500);
    if (error) this.err(error);
    return data as MgEvent[];
  }

  async event(id: string): Promise<MgEvent | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const c = await this.db();
    const { data, error } = await c.from('mg_events').select('*').eq('id', id).maybeSingle();
    if (error) this.err(error);
    return data as MgEvent | null;
  }

  async myEntry(eventId: string): Promise<Entry | null> {
    const uid = this.auth.user()?.id;
    if (!uid) return null;
    const c = await this.db();
    let { data, error } = await c.from('mg_entries').select('phrase_ids,rvm_guess').eq('event_id', eventId).eq('user_id', uid).maybeSingle();
    if (error?.code === '42703') ({ data, error } = await c.from('mg_entries').select('phrase_ids').eq('event_id', eventId).eq('user_id', uid).maybeSingle() as any);
    if (error) this.err(error);
    return data ? { phrase_ids: (data as any).phrase_ids || [], rvm_guess: (data as any).rvm_guess ?? null } : null;
  }

  async myEntries(): Promise<Map<string, number[]>> {
    const uid = this.auth.user()?.id;
    if (!uid) return new Map();
    const c = await this.db();
    const { data } = await c.from('mg_entries').select('event_id,phrase_ids').eq('user_id', uid);
    return new Map((data || []).map((r: any) => [r.event_id, r.phrase_ids]));
  }

  async saveEntry(eventId: string, phraseIds: number[], rvmGuess: string | null = null): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Accedi per giocare.');
    if (!this.auth.username()) throw new Error('Scegli prima uno username nella pagina del tuo account.');
    if (phraseIds.length > MAX_PICKS) throw new Error(`Puoi scegliere al massimo ${MAX_PICKS} formule.`);
    if (!phraseIds.length && !rvmGuess) throw new Error('Scegli almeno una formula o la TV degli RVM.');
    const c = await this.db();
    const row: any = { event_id: eventId, user_id: uid, phrase_ids: phraseIds };
    if (rvmGuess !== undefined) row.rvm_guess = rvmGuess;
    const { error } = await c.from('mg_entries').upsert(row);
    if (error) {
      if (/row-level security/i.test(error.message)) throw new Error('Le schedine per questo evento sono chiuse.');
      if (error.code === '42703' || error.code === 'PGRST204') throw new Error('La sezione RVM non è ancora attiva sul sito.');
      if (/scelta_check|phrase_ids_check/.test(error.message)) throw new Error('Scegli almeno una formula o la TV degli RVM.');
      this.err(error);
    }
  }

  async withdrawEntry(eventId: string): Promise<void> {
    const uid = this.auth.user()?.id;
    const c = await this.db();
    const { error } = await c.from('mg_entries').delete().match({ event_id: eventId, user_id: uid });
    if (error) this.err(error);
  }

  async entriesCount(eventId: string): Promise<number | null> {
    const c = await this.db();
    const { count } = await c.from('mg_entries').select('user_id', { count: 'exact', head: true }).eq('event_id', eventId);
    return count ?? null;
  }

  async scores(eventId: string): Promise<Score[]> {
    const c = await this.db();
    let { data, error } = await c.from('mg_scores').select('user_id,username,phrase_ids,points,hits,rvm_guess,rvm_hit').eq('event_id', eventId).order('points', { ascending: false });
    if (error?.code === '42703') ({ data, error } = await c.from('mg_scores').select('user_id,username,phrase_ids,points,hits').eq('event_id', eventId).order('points', { ascending: false }) as any);
    if (error) this.err(error);
    return data as Score[];
  }

  async leaderboard(limit = 20): Promise<LeaderRow[]> {
    const c = await this.db();
    const { data, error } = await c.from('mg_leaderboard').select('*').order('points', { ascending: false }).limit(limit);
    if (error) this.err(error);
    return data as LeaderRow[];
  }

  // ---------- Riprendiamoci Fiume! ----------
  /** Partita di questo turno (null se non ancora iniziata o se non si è collegati). */
  async fiumePlay(round: string): Promise<FiumePlay | null> {
    const uid = this.auth.user()?.id;
    if (!uid) return null;
    const c = await this.db();
    const { data, error } = await c.from('mg_fiume_plays').select('score,total,answers,finished_at').eq('user_id', uid).eq('round', round).maybeSingle();
    if (error) this.err(error);
    return data as FiumePlay | null;
  }

  /** Registra l'inizio della partita (0 punti). 'already' se la partita di questo turno esiste già. */
  async fiumeStart(round: string, total: number): Promise<'started' | 'already'> {
    const uid = this.auth.user()?.id;
    if (!uid) throw new Error('Accedi per giocare.');
    if (!this.auth.username()) throw new Error('Scegli uno username per giocare.');
    const c = await this.db();
    const { error } = await c.from('mg_fiume_plays').insert({ user_id: uid, round, score: 0, total });
    if (error) { if (error.code === '23505') return 'already'; this.err(error); }
    return 'started';
  }

  /** Chiude la partita con punti e risposte (si può fare una volta sola). */
  async fiumeFinish(round: string, score: number, answers: FiumeAnswerRecord[]): Promise<void> {
    const uid = this.auth.user()?.id;
    const c = await this.db();
    const { error } = await c.from('mg_fiume_plays').update({ score, answers, finished_at: new Date().toISOString() })
      .eq('user_id', uid).eq('round', round).is('finished_at', null);
    if (error) this.err(error);
  }

  // ---------- amministrazione ----------
  async isAdmin(): Promise<boolean> {
    if (!this.auth.user()) return false;
    const c = await this.db();
    const { data, error } = await c.rpc('is_admin');
    return !error && data === true;
  }

  async saveEvent(e: Partial<MgEvent> & { name: string; starts_at: string }): Promise<MgEvent> {
    const c = await this.db();
    const row: any = { name: e.name.trim(), starts_at: e.starts_at, youtube_channel: e.youtube_channel || null, org_link: e.org_link || null };
    const q = e.id ? c.from('mg_events').update(row).eq('id', e.id) : c.from('mg_events').insert(row);
    const { data, error } = await q.select('*').single();
    if (error) this.err(error);
    return data as MgEvent;
  }

  async deleteEvent(id: string) {
    const c = await this.db();
    const { error } = await c.from('mg_events').delete().eq('id', id);
    if (error) this.err(error);
  }

  /** Salva il risultato (provvisorio o confermato) di un evento. */
  async saveResult(id: string, r: { video_id?: string | null; detected?: { [k: string]: number }; said_ids: number[]; rvm_sources?: string[]; confirm: boolean }) {
    const c = await this.db();
    const row: any = { said_ids: r.said_ids, status: r.confirm ? 'confirmed' : 'to_review', confirmed_at: r.confirm ? new Date().toISOString() : null };
    if (r.video_id !== undefined) row.video_id = r.video_id;
    if (r.detected !== undefined) row.detected = r.detected;
    if (r.rvm_sources !== undefined) row.rvm_sources = r.rvm_sources;
    const { error } = await c.from('mg_events').update(row).eq('id', id);
    if (error) this.err(error);
  }

  /** Collega un video a un evento senza calcolare nulla (quando la trascrizione non è disponibile). */
  async linkVideo(id: string, videoId: string) {
    const c = await this.db();
    const { error } = await c.from('mg_events').update({ video_id: videoId, status: 'to_review', confirmed_at: null }).eq('id', id).neq('status', 'confirmed');
    if (error) this.err(error);
  }

  /** Eventi confermati collegati a un video (per il token «Polymarket» nel catalogo). */
  async confirmedByVideo(): Promise<Map<string, MgEvent>> {
    const c = await this.db();
    const { data, error } = await c.from('mg_events').select('*').eq('status', 'confirmed').not('video_id', 'is', null);
    if (error) return new Map();
    return new Map((data as MgEvent[]).map(e => [e.video_id as string, e]));
  }

  async reopenResult(id: string) {
    const c = await this.db();
    const { error } = await c.from('mg_events').update({ status: 'to_review', confirmed_at: null }).eq('id', id);
    if (error) this.err(error);
  }

  async savePhrase(p: { id?: number; text: string; points: number; variants?: string[]; active?: boolean }) {
    const c = await this.db();
    const row: any = { text: p.text.trim(), points: p.points, variants: p.variants ?? [], active: p.active ?? true };
    const { error } = p.id ? await c.from('mg_phrases').update(row).eq('id', p.id) : await c.from('mg_phrases').insert(row);
    if (error) { if (error.code === '23505') throw new Error('Questa formula esiste già.'); this.err(error); }
  }

  /**
   * Calcola le formule dette in un video (dalla trascrizione) o in un testo incollato
   * e le salva come risultato provvisorio dell'evento, da confermare.
   */
  async detectAndSave(eventId: string, src: { videoId?: string | null; text?: string }): Promise<{ found: number; source: string }> {
    const phrases = await this.phrases(true);
    let text = src.text || '', source = 'testo incollato';
    if (!text && src.videoId) {
      const tr = await this.transcript(src.videoId);
      text = tr.segments.map(s => s.text).join(' ');
      source = tr.source === 'indice' ? 'trascrizione del sito' : 'trascrizione di YouTube';
    }
    if (!text.trim()) throw new Error('Nessun testo da analizzare.');
    const detected = countPhrases(text, phrases);
    const said = Object.keys(detected).map(Number);
    await this.saveResult(eventId, { video_id: src.videoId === undefined ? undefined : src.videoId, detected, said_ids: said, confirm: false });
    return { found: said.length, source };
  }

  async deletePhrase(id: number) {
    const c = await this.db();
    const { error } = await c.from('mg_phrases').delete().eq('id', id);
    if (error) this.err(error);
  }

  /** Trascrizione dal server (indice del sito o YouTube). */
  async transcript(videoId: string): Promise<{ source: string; segments: { start: number; text: string }[] }> {
    const r = await fetch('/api/video-transcript?id=' + encodeURIComponent(videoId));
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message || 'Trascrizione non disponibile.');
    return body;
  }
}
