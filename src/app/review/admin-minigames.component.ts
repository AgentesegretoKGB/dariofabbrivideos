import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MgEvent, MinigameService, Phrase, RVM_TVS, fold } from '../minigames/minigame.service';
import { shortLabel } from '../minigames/format';
import { youtubeId } from '../shared/catalog-video';
import { PhraseEditorComponent } from './phrase-editor.component';

interface Draft {
  name: string; date: string; time: string; youtube_channel: string; org_link: string;
  video: string; pasted: string; said: Set<number>; rvm: Set<string>; query: string; onlyFound: boolean;
  busy: boolean; msg: string; error: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
function splitLocal(iso: string) {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

/** Revisione dei minigiochi: eventi, risultati da confermare, formule. Solo per amministratori. */
@Component({
  selector: 'app-admin-minigames',
  standalone: true,
  imports: [FormsModule, RouterLink, PhraseEditorComponent],
  templateUrl: './admin-minigames.component.html',
  styleUrls: ['./admin-minigames.component.css']
})
export class AdminMinigamesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);

  readonly TVS = RVM_TVS;
  section = signal<'eventi' | 'formule'>('eventi');
  checking = signal(true);
  admin = signal(false);
  error = signal('');
  events = signal<MgEvent[]>([]);
  phrases = signal<Phrase[]>([]);
  counts = signal<Map<string, number>>(new Map());
  openId = signal<string | null>(null);
  drafts = new Map<string, Draft>();

  // nuovo evento
  nf = { name: '', date: '', time: '', youtube_channel: '', org_link: '' };
  creating = signal(false);
  createMsg = signal('');

  readonly sortedEvents = computed(() => {
    const rank = (e: MgEvent) => e.status === 'to_review' ? 0 : (new Date(e.starts_at).getTime() <= Date.now() && e.status === 'open') ? 1 : e.status === 'open' ? 2 : 3;
    return [...this.events()].sort((a, b) => rank(a) - rank(b) || b.starts_at.localeCompare(a.starts_at));
  });
  readonly byId = computed(() => new Map(this.phrases().map(p => [p.id, p])));

  async ngOnInit() { await this.init(); }

  async init() {
    this.checking.set(true);
    try {
      await new Promise<void>(r => { const t = setInterval(() => { if (this.auth.ready()) { clearInterval(t); r(); } }, 50); });
      this.admin.set(await this.mg.isAdmin());
      if (this.admin()) await this.reload();
    } catch (e: any) { this.error.set(e.message); }
    this.checking.set(false);
  }

  async reload(resetId?: string) {
    const [ev, ph] = await Promise.all([this.mg.events(), this.mg.phrases(true)]);
    this.events.set(ev); this.phrases.set(ph);
    const counts = new Map<string, number>();
    await Promise.all(ev.map(async e => counts.set(e.id, (await this.mg.entriesCount(e.id)) ?? 0)));
    this.counts.set(counts);
    const re = resetId && ev.find(e => e.id === resetId);
    if (re) this.resetDraft(re);
    if (resetId && !re) this.drafts.delete(resetId);
  }

  draft(e: MgEvent): Draft {
    if (!this.drafts.has(e.id)) this.resetDraft(e);
    return this.drafts.get(e.id)!;
  }

  private resetDraft(e: MgEvent) {
    const { date, time } = splitLocal(e.starts_at);
    const old = this.drafts.get(e.id);
    this.drafts.set(e.id, {
      name: e.name, date, time, youtube_channel: e.youtube_channel || '', org_link: e.org_link || '',
      video: e.video_id ? 'https://www.youtube.com/watch?v=' + e.video_id : '', pasted: '',
      said: new Set(e.said_ids || []), rvm: new Set(e.rvm_sources || []), query: old?.query || '', onlyFound: old?.onlyFound ?? !!Object.keys(e.detected || {}).length,
      busy: false, msg: old?.msg || '', error: old?.error || false,
    });
  }

  toggleOpen(e: MgEvent) { this.openId.set(this.openId() === e.id ? null : e.id); }

  statusLabel(e: MgEvent) {
    if (e.status === 'confirmed') return 'Confermato';
    if (e.status === 'to_review') return 'Da confermare';
    return new Date(e.starts_at).getTime() > Date.now() ? 'Schedine aperte' : 'Da revisionare';
  }
  when(iso: string) { return shortLabel(iso); }

  async create() {
    const f = this.nf;
    if (!f.name.trim() || !f.date || !f.time) { this.createMsg.set('Nome, data e ora sono obbligatori.'); return; }
    this.creating.set(true); this.createMsg.set('');
    try {
      await this.mg.saveEvent({ name: f.name, starts_at: toIso(f.date, f.time), youtube_channel: f.youtube_channel, org_link: f.org_link });
      this.nf = { name: '', date: '', time: '', youtube_channel: '', org_link: '' };
      this.createMsg.set('Evento creato.');
      await this.reload();
    } catch (e: any) { this.createMsg.set(e.message); }
    this.creating.set(false);
  }

  async saveInfo(e: MgEvent) {
    const d = this.draft(e);
    if (!d.name.trim() || !d.date || !d.time) { this.say(d, 'Nome, data e ora sono obbligatori.', true); return; }
    await this.run(e, async () => {
      await this.mg.saveEvent({ id: e.id, name: d.name, starts_at: toIso(d.date, d.time), youtube_channel: d.youtube_channel, org_link: d.org_link });
      return 'Dati dell\'evento salvati.';
    });
  }

  async remove(e: MgEvent) {
    if (!confirm(`Eliminare l'evento "${e.name}" e tutte le sue schedine? Non si può annullare.`)) return;
    try { await this.mg.deleteEvent(e.id); await this.reload(e.id); }
    catch (err: any) { alert(err.message); }
  }

  async detectVideo(e: MgEvent) {
    const d = this.draft(e);
    const id = youtubeId(d.video) || (/^[A-Za-z0-9_-]{11}$/.test(d.video.trim()) ? d.video.trim() : null);
    if (!id) { this.say(d, 'Incolla un link YouTube valido.', true); return; }
    await this.run(e, async () => {
      const r = await this.mg.detectAndSave(e.id, { videoId: id });
      return `Trovate ${r.found} formule nella ${r.source}. Controlla l'elenco e conferma.`;
    });
  }

  async detectText(e: MgEvent) {
    const d = this.draft(e);
    if (!d.pasted.trim()) { this.say(d, 'Incolla prima il testo della trascrizione.', true); return; }
    await this.run(e, async () => {
      const r = await this.mg.detectAndSave(e.id, { text: d.pasted });
      d.pasted = '';
      return `Trovate ${r.found} formule nel testo incollato. Controlla l'elenco e conferma.`;
    });
  }

  toggleSaid(e: MgEvent, p: Phrase) {
    const d = this.draft(e);
    d.said.has(p.id) ? d.said.delete(p.id) : d.said.add(p.id);
    d.msg = '';
  }

  toggleRvm(e: MgEvent, id: string) {
    const d = this.draft(e);
    d.rvm.has(id) ? d.rvm.delete(id) : d.rvm.add(id);
    d.msg = '';
  }

  visiblePhrases(e: MgEvent): Phrase[] {
    const d = this.draft(e), q = fold(d.query).trim(), det = e.detected || {};
    let list = this.phrases().filter(p => p.active || d.said.has(p.id));
    if (d.onlyFound && !q) list = list.filter(p => det[p.id] || d.said.has(p.id));
    if (q) list = list.filter(p => fold(p.text).includes(q));
    return list.sort((a, b) => (det[b.id] || 0) - (det[a.id] || 0) || a.text.localeCompare(b.text));
  }
  found(e: MgEvent, p: Phrase) { return (e.detected || {})[p.id] || 0; }

  async saveResult(e: MgEvent, confirm: boolean) {
    const d = this.draft(e);
    if (confirm && !window.confirm(`Confermare i risultati di "${e.name}"? I punti verranno assegnati a tutti i giocatori.`)) return;
    await this.run(e, async () => {
      await this.mg.saveResult(e.id, { said_ids: [...d.said], rvm_sources: [...d.rvm], confirm });
      return confirm ? 'Risultati confermati: punti assegnati.' : 'Salvato come provvisorio.';
    });
  }

  async reopen(e: MgEvent) {
    await this.run(e, async () => { await this.mg.reopenResult(e.id); return 'Risultati riaperti: ora puoi modificarli.'; });
  }

  private say(d: Draft, msg: string, error = false) { d.msg = msg; d.error = error; }

  /** Esegue un'azione su un evento, ricarica i dati e mostra il messaggio sulla scheda aggiornata. */
  private async run(e: MgEvent, fn: () => Promise<string>) {
    const d = this.draft(e);
    d.busy = true; d.msg = '';
    try {
      const m = await fn();
      await this.reload(e.id);
      this.say(this.draft(e), m);
    } catch (err: any) { this.say(this.draft(e), err.message, true); }
    this.draft(e).busy = false;
  }

}
