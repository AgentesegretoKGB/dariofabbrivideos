import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MAX_PICKS, MgEvent, MinigameService, Phrase, Score, fold } from './minigame.service';
import { countdown, whenLabel, youtubeUrl } from './format';

@Component({
  selector: 'app-prediction-event',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './prediction-event.component.html',
  styleUrls: ['./prediction-event.component.css']
})
export class PredictionEventComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);
  private route = inject(ActivatedRoute);
  readonly MAX = MAX_PICKS;

  ev = signal<MgEvent | null>(null);
  phrases = signal<Phrase[]>([]);
  loaded = signal(false);
  error = signal('');
  now = signal(Date.now());
  private timer: any;

  picks = signal<number[]>([]);
  saved = signal<number[] | null>(null);
  saving = signal(false);
  msg = signal('');
  msgError = signal(false);
  query = signal('');
  participants = signal<number | null>(null);
  scores = signal<Score[]>([]);

  readonly open = computed(() => { const e = this.ev(); return !!e && new Date(e.starts_at).getTime() > this.now(); });
  readonly byId = computed(() => new Map(this.phrases().map(p => [p.id, p])));
  readonly picked = computed(() => this.picks().map(id => this.byId().get(id)).filter((p): p is Phrase => !!p));
  readonly potential = computed(() => this.picked().reduce((a, p) => a + p.points, 0));
  readonly dirty = computed(() => JSON.stringify([...this.picks()].sort()) !== JSON.stringify([...(this.saved() || [])].sort()));
  readonly filtered = computed(() => {
    const q = fold(this.query()).trim();
    const list = this.phrases();
    return q ? list.filter(p => fold(p.text).includes(q) || (p.variants || []).some(v => fold(v).includes(q))) : list;
  });
  readonly said = computed(() => new Set(this.ev()?.said_ids || []));
  readonly myScore = computed(() => this.scores().find(s => s.user_id === this.auth.user()?.id) || null);
  readonly saidPhrases = computed(() => (this.ev()?.said_ids || []).map(id => this.byId().get(id)).filter((p): p is Phrase => !!p).sort((a, b) => b.points - a.points));

  sort: 'alpha' | 'points' = 'alpha';
  sorted(list: Phrase[]) { return this.sort === 'points' ? [...list].sort((a, b) => b.points - a.points || a.text.localeCompare(b.text)) : list; }

  ngOnInit() {
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    this.route.paramMap.subscribe(p => this.load(p.get('id') || ''));
  }
  ngOnDestroy() { clearInterval(this.timer); }

  async load(id: string) {
    this.loaded.set(false); this.error.set('');
    try {
      const [ev, phrases] = await Promise.all([this.mg.event(id), this.mg.phrases(true)]);
      this.ev.set(ev);
      this.phrases.set(phrases.filter(p => p.active || ev?.said_ids?.includes(p.id)));
      if (ev) {
        const mine = await this.mg.myEntry(ev.id);
        this.saved.set(mine); this.picks.set(mine ? [...mine] : []);
        this.participants.set(await this.mg.entriesCount(ev.id));
        if (ev.status === 'confirmed') this.scores.set(await this.mg.scores(ev.id));
      }
    } catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }

  isPicked(p: Phrase) { return this.picks().includes(p.id); }

  toggle(p: Phrase) {
    if (!this.open()) return;
    this.msg.set('');
    const cur = this.picks();
    if (cur.includes(p.id)) this.picks.set(cur.filter(x => x !== p.id));
    else if (cur.length < MAX_PICKS) this.picks.set([...cur, p.id]);
    else { this.msgError.set(true); this.msg.set(`Puoi scegliere al massimo ${MAX_PICKS} formule: togline una per aggiungerne un'altra.`); }
  }

  async save() {
    const e = this.ev(); if (!e) return;
    this.saving.set(true); this.msg.set('');
    try {
      await this.mg.saveEntry(e.id, this.picks());
      this.saved.set([...this.picks()]);
      this.msgError.set(false); this.msg.set('Schedina salvata! Puoi modificarla fino all\'inizio dell\'evento.');
      this.participants.set(await this.mg.entriesCount(e.id));
    } catch (err: any) { this.msgError.set(true); this.msg.set(err.message); }
    this.saving.set(false);
  }

  async withdraw() {
    const e = this.ev(); if (!e || !confirm('Vuoi ritirare la tua schedina?')) return;
    try {
      await this.mg.withdrawEntry(e.id);
      this.saved.set(null); this.picks.set([]);
      this.msgError.set(false); this.msg.set('Schedina ritirata.');
      this.participants.set(await this.mg.entriesCount(e.id));
    } catch (err: any) { this.msgError.set(true); this.msg.set(err.message); }
  }

  when(iso: string) { return whenLabel(iso); }
  cd(iso: string) { return countdown(iso, this.now()); }
  yt(id: string) { return youtubeUrl(id); }
  link(u: string) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; }
  host(u: string) { try { return new URL(this.link(u)).host.replace(/^www\./, ''); } catch { return u; } }
}
