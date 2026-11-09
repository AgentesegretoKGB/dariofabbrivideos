import { Component, ElementRef, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FIUME_WORDS, FiumeWord, SECONDS_PER_WORD } from './fiume-words';

interface Answer { word: FiumeWord; given: string; ok: boolean; timedOut: boolean; }

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
  @ViewChild('answerInput') answerInput?: ElementRef<HTMLInputElement>;
  readonly SECONDS = SECONDS_PER_WORD;
  readonly total = FIUME_WORDS.length;

  phase = signal<'intro' | 'play' | 'end'>('intro');
  words = signal<FiumeWord[]>([]);
  index = signal(0);
  answers = signal<Answer[]>([]);
  draft = '';
  left = signal(SECONDS_PER_WORD * 1000);   // millisecondi rimasti
  private deadline = 0;
  private timer: any;

  readonly current = computed(() => this.words()[this.index()]);
  readonly score = computed(() => this.answers().filter(a => a.ok).length);
  readonly secondsLeft = computed(() => Math.ceil(this.left() / 1000));
  readonly progress = computed(() => this.left() / (SECONDS_PER_WORD * 1000));

  start() {
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
    this.answers.update(a => [...a, { word: w, given: this.draft.trim(), ok: isCorrect(this.draft, w), timedOut }]);
    if (this.index() + 1 < this.words().length) { this.index.update(i => i + 1); this.nextWord(); }
    else this.phase.set('end');
  }

  ngOnDestroy() { clearInterval(this.timer); }
}
