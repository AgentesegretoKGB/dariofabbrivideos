import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export interface CalEvent {
  id?: string;
  title: string;
  place: string | null;
  day: string;            // AAAA-MM-GG
  time: string | null;    // HH:MM(:SS)
  description: string | null;
  link: string | null;
}
export interface CalReport extends CalEvent { email: string | null; status: 'new' | 'approved' | 'rejected'; created_at: string; }

const clean = (s: string | null | undefined) => { const v = (s || '').trim(); return v ? v : null; };
const row = (e: Partial<CalEvent>) => ({ title: (e.title || '').trim(), place: clean(e.place), day: e.day, time: clean(e.time), description: clean(e.description), link: clean(e.link) });

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private auth = inject(AuthService);
  private db() { return this.auth.client(); }
  private err(e: any): never {
    if (e?.code === 'PGRST205' || e?.code === '42P01') throw new Error('Il calendario non è ancora attivo sul sito.');
    throw new Error(e?.message || String(e));
  }

  /** Eventi tra due date (comprese). */
  async events(from: string, to: string): Promise<CalEvent[]> {
    const c = await this.db();
    const { data, error } = await c.from('cal_events').select('id,title,place,day,time,description,link').gte('day', from).lte('day', to).order('day').order('time', { nullsFirst: true });
    if (error) this.err(error);
    return data as CalEvent[];
  }

  async allEvents(): Promise<CalEvent[]> {
    const c = await this.db();
    const { data, error } = await c.from('cal_events').select('id,title,place,day,time,description,link').order('day', { ascending: false }).limit(1000);
    if (error) this.err(error);
    return data as CalEvent[];
  }

  /** Segnalazione dal pubblico: non chiede indietro la riga (il pubblico non può rileggerla). */
  async report(e: Partial<CalEvent> & { email?: string | null }) {
    if (!(e.title || '').trim() || !e.day) throw new Error('Titolo e data sono obbligatori.');
    const c = await this.db();
    const { error } = await c.from('cal_reports').insert({ ...row(e), email: clean(e.email) });
    if (error) { if (/email_check/.test(error.message)) throw new Error('L\'indirizzo email non sembra valido.'); this.err(error); }
  }

  // ---------- amministrazione ----------
  async saveEvent(e: Partial<CalEvent>): Promise<void> {
    if (!(e.title || '').trim() || !e.day) throw new Error('Nome e data sono obbligatori.');
    const c = await this.db();
    const { error } = e.id ? await c.from('cal_events').update(row(e)).eq('id', e.id) : await c.from('cal_events').insert(row(e));
    if (error) this.err(error);
  }

  async deleteEvent(id: string) {
    const c = await this.db();
    const { error } = await c.from('cal_events').delete().eq('id', id);
    if (error) this.err(error);
  }

  async reports(): Promise<CalReport[]> {
    const c = await this.db();
    const { data, error } = await c.from('cal_reports').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) this.err(error);
    return data as CalReport[];
  }

  async setReportStatus(id: string, status: CalReport['status']) {
    const c = await this.db();
    const { error } = await c.from('cal_reports').update({ status }).eq('id', id);
    if (error) this.err(error);
  }

  async deleteReport(id: string) {
    const c = await this.db();
    const { error } = await c.from('cal_reports').delete().eq('id', id);
    if (error) this.err(error);
  }
}

// ---------- date ----------
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
export const linkHref = (u: string) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
export const linkHost = (u: string) => { try { return new URL(linkHref(u)).host.replace(/^www\./, ''); } catch { return u; } };
