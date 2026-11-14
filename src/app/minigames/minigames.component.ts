import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { LeaderRow, MinigameService } from './minigame.service';

@Component({
  selector: 'app-minigames',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="rv-page-title">Minigiochi</h1>

    <section class="app-rank" aria-labelledby="classifica">
      <h2 class="app-rank__title" id="classifica">Classifica</h2>
      @if (error()) {
        <p class="app-mg-note">{{ error() }}</p>
      } @else if (!loaded()) {
        <p class="app-mg-note">Carico la classifica…</p>
      } @else if (!rows().length) {
        <p class="app-mg-note">Ancora nessun punteggio: la classifica si riempie quando vengono confermati i risultati del primo evento.</p>
      } @else {
        <ol class="app-board">
          @for (r of rows(); track r.user_id; let i = $index) {
            <li class="app-board__row" [class.is-me]="r.user_id === auth.user()?.id">
              <span class="app-board__pos">{{ i + 1 }}</span>
              <span class="app-board__name">&#64;{{ r.username }}</span>
              <span class="app-board__meta">{{ detail(r) }}</span>
              <span class="app-board__pts">{{ r.points }} pt</span>
            </li>
          }
        </ol>
      }
    </section>

    <section aria-labelledby="giochi">
      <h2 class="fc-section-title" id="giochi">Minigiochi</h2>
      <div class="fc-grid">
        <a class="fc-video app-game" routerLink="/minigiochi/previsioni">
          <div class="app-game__art">
            <svg viewBox="0 0 416 225" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafico con una linea blu che sale">
              <rect width="416" height="225" fill="#ffffff"/>
              <g stroke="#e6e9ee" stroke-width="1">
                <line x1="24" y1="40" x2="376" y2="40"/><line x1="24" y1="85" x2="376" y2="85"/>
                <line x1="24" y1="130" x2="376" y2="130"/><line x1="24" y1="175" x2="376" y2="175"/>
              </g>
              <g fill="#9aa3ad" font-family="Arial, sans-serif" font-size="11"><text x="382" y="44">75%</text><text x="382" y="134">25%</text></g>
              <path d="M24 168 L56 160 L84 164 L112 146 L140 150 L168 128 L196 136 L224 112 L252 118 L280 92 L308 98 L336 70 L360 58"
                    fill="none" stroke="#1652f0" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
              <circle cx="360" cy="58" r="7" fill="#1652f0"/><circle cx="360" cy="58" r="13" fill="#1652f0" fill-opacity=".18"/>
            </svg>
          </div>
          <div class="app-game__info">
            <h3 class="app-game__title">Polymarket</h3>
            <p class="app-game__desc">Profetizza le parole del vate!</p>
          </div>
        </a>
        <a class="fc-video app-game" routerLink="/minigiochi/fiume">
          <div class="app-game__art">
            <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Tricolore attraversato da un fiume azzurro">
              <rect x="0" y="0" width="134" height="225" fill="#009246"/>
              <rect x="133" y="0" width="134" height="225" fill="#ffffff"/>
              <rect x="266" y="0" width="134" height="225" fill="#ce2b37"/>
              <path d="M-10 70 C 40 40, 80 40, 120 80 S 190 150, 240 120 S 320 50, 410 95"
                    fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-opacity=".55"/>
              <path d="M-10 70 C 40 40, 80 40, 120 80 S 190 150, 240 120 S 320 50, 410 95"
                    fill="none" stroke="#3fa9f5" stroke-width="24" stroke-linecap="round"/>
              <path d="M-10 70 C 40 40, 80 40, 120 80 S 190 150, 240 120 S 320 50, 410 95"
                    fill="none" stroke="#d6eeff" stroke-width="4" stroke-linecap="round" stroke-opacity=".8" transform="translate(0 -5)"/>
            </svg>
          </div>
          <div class="app-game__info">
            <h3 class="app-game__title">Riprendiamoci Fiume!</h3>
            <p class="app-game__desc">Traduci in italiano la parola inglese entro 10 secondi.</p>
          </div>
        </a>
      </div>
    </section>
  `,
  styles: [`
    .app-mg-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .app-mg-note { color: var(--muted); text-align: center; }
    .app-rank { max-width: 640px; margin: var(--space-6) auto 0; }
    .app-rank__title { margin: 0 0 var(--space-4); text-align: center; font-size: 31px; line-height: 36px; }
    .app-board { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); overflow: hidden; box-shadow: var(--shadow-card); }
    .app-board__row { display: grid; grid-template-columns: 40px 1fr auto auto; gap: var(--space-3); align-items: center; padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
    .app-board__row:first-child { border-top: 0; }
    .app-board__row.is-me { background: var(--accent-soft); }
    .app-board__pos { font-weight: 700; color: var(--muted); }
    .app-board__name { font-weight: 700; }
    .app-board__meta { font-size: 14px; color: var(--muted); }
    .app-board__pts { font-weight: 700; min-width: 60px; text-align: right; }
    .app-game { color: var(--ink); text-decoration: none; }
    .app-game:hover { box-shadow: var(--shadow-card-hover); }
    .app-game__art { aspect-ratio: 16 / 9; background: #fff; border-bottom: 1px solid var(--border); }
    .app-game__art svg { display: block; width: 100%; height: 100%; }
    .app-game__info { padding: var(--space-3) var(--space-4) var(--space-4); }
    .app-game__title { margin: 0 0 var(--space-1); font-size: 19px; line-height: 26px; }
    .app-game__desc { margin: 0; font-size: 15px; line-height: 22px; color: var(--muted); }
    @media (max-width: 639px) {
      .app-rank { margin-top: var(--space-4); }
      .app-rank__title { font-size: 25px; line-height: 32px; }
      .app-board__row { grid-template-columns: 32px 1fr auto; }
      .app-board__meta { display: none; }
    }
  `]
})
export class MinigamesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);
  rows = signal<LeaderRow[]>([]);
  loaded = signal(false);
  error = signal('');

  detail(r: LeaderRow): string {
    const parts: string[] = [];
    if (r.polymarket_points || r.events) parts.push(`Polymarket ${r.polymarket_points ?? r.points}`);
    if (r.fiume_points || r.fiume_games) parts.push(`Fiume ${r.fiume_points}`);
    return parts.join(' · ');
  }

  async ngOnInit() {
    try { this.rows.set(await this.mg.leaderboard(50)); }
    catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }
}
