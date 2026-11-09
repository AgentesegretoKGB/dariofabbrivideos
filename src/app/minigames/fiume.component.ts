import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FIUME_ROUND, FIUME_WORDS, FiumeWord, SECONDS_PER_WORD } from './fiume-words';
import { AuthService } from '../auth/auth.service';
import { FiumeAnswerRecord, MinigameService } from './minigame.service';


const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(il|lo|la|i|gli|le|l|un|uno|una)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** Distanza di modifica: per perdonare un errore di battitura. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function isCorrect(given: string, w: FiumeWord): boolean {
  const g = norm(given);
  if (!g) return false;
  return w.it.some(a => { const t = norm(a); return g === t || distance(g, t) <= Math.floor(t.length / 8); });
}

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

@Component({
  selector: 'app-fiume',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './fiume.component.html',
  styleUrls: ['./fiume.component.css']
})
export class FiumeComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);
  @ViewChild('answerInput') answerInput?: ElementRef<HTMLInputElement>;
  readonly SECONDS = SECONDS_PER_WORD;
  readonly total = FIUME_WORDS.length;

  /** loading: controllo se ha già giocato · intro · play · end (risultato) */
  phase = signal<'loading' | 'intro' | 'play' | 'end'>('loading');
  interrupted = signal(false);
  words = signal<FiumeWord[]>([]);
  index = signal(0);
  answers = signal<FiumeAnswerRecord[]>([]);
  draft = '';
  left = signal(SECONDS_PER_WORD * 1000);   // millisecondi rimasti
  error = signal('');
  starting = signal(false);
  private deadline = 0;
  private timer: any;
  private checkedFor: string | null | undefined = undefined;

  readonly current = computed(() => this.words()[this.index()]);
  readonly score = computed(() => this.answers().filter(a => a.ok).length);
  readonly secondsLeft = computed(() => Math.ceil(this.left() / 1000));
  readonly progress = computed(() => this.left() / (SECONDS_PER_WORD * 1000));
  readonly finalTotal = signal(FIUME_WORDS.length);

  constructor() {
    // Appena si sa chi è l'utente: se ha già giocato questo turno mostra subito il risultato
    effect(() => {
      if (!this.auth.ready()) return;
      const id = this.auth.user()?.id ?? null;
      if (id === this.checkedFor || this.phase() === 'play') return;
      this.checkedFor = id;
      this.loadPlay();
    });
  }

  private async loadPlay() {
    this.phase.set('loading');
    try {
      const p = await this.mg.fiumePlay(FIUME_ROUND);
      if (p) this.showResult(p.answers || [], p.total, !p.finished_at);
      else this.phase.set('intro');
    } catch (e: any) { this.error.set(e.message); this.phase.set('intro'); }
  }

  private showResult(answers: FiumeAnswerRecord[], total: number, interrupted: boolean) {
    this.answers.set(answers);
    this.finalTotal.set(total);
    this.interrupted.set(interrupted);
    this.phase.set('end');
  }

  async start() {
    this.error.set(''); this.starting.set(true);
    try {
      const r = await this.mg.fiumeStart(FIUME_ROUND, this.total);
      if (r === 'already') { await this.loadPlay(); return; }
    } catch (e: any) { this.error.set(e.message); return; }
    finally { this.starting.set(false); }
    this.words.set(shuffle(FIUME_WORDS));
    this.answers.set([]);
    this.index.set(0);
    this.phase.set('play');
    this.nextWord();
  }

  private nextWord() {
    this.draft = '';
    this.deadline = Date.now() + SECONDS_PER_WORD * 1000;
    this.left.set(SECONDS_PER_WORD * 1000);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const l = Math.max(0, this.deadline - Date.now());
      this.left.set(l);
      if (l === 0) this.submit(true);
    }, 50);
    setTimeout(() => this.answerInput?.nativeElement.focus());
  }

  /** Conferma la risposta (o allo scadere del tempo vale quello che è stato scritto finora). */
  submit(timedOut = false) {
    if (this.phase() !== 'play') return;
    clearInterval(this.timer);
    const w = this.current();
    this.answers.update(a => [...a, { en: w.en, it: w.it, given: this.draft.trim(), ok: isCorrect(this.draft, w), timedOut }]);
    if (this.index() + 1 < this.words().length) { this.index.update(i => i + 1); this.nextWord(); }
    else this.finish();
  }

  private async finish() {
    this.showResult(this.answers(), this.total, false);
    try { await this.mg.fiumeFinish(FIUME_ROUND, this.score(), this.answers()); }
    catch (e: any) { this.error.set('Punteggio non registrato: ' + e.message); }
  }

  ngOnDestroy() { clearInterval(this.timer); }
}
