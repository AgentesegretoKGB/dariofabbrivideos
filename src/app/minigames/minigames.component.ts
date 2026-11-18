import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
        <div class="app-board">
          <table class="app-board__table">
            <thead>
              <tr>
                <th scope="col" class="app-board__pos"><span class="app-mg-hidden">Posizione</span>#</th>
                <th scope="col" class="app-board__name"><span class="app-board__long">Giocatore</span><span class="app-board__short" aria-hidden="true">Nome</span></th>
                <th scope="col" class="app-board__num app-board__pts"><span class="app-board__long">Punti</span><span class="app-board__short" aria-hidden="true">Punti</span></th>
                <th scope="col" class="app-board__num" title="Punti in Polymarket"><abbr title="Polymarket">PM</abbr></th>
                <th scope="col" class="app-board__num" title="Giocate: schedine Polymarket giocate"><abbr title="Giocate">G.</abbr></th>
                <th scope="col" class="app-board__num" title="Media punti Polymarket per giocata">Media <abbr title="giocate">G.</abbr></th>
                <th scope="col" class="app-board__num" title="Punti in Riprendiamoci Fiume!"><abbr title="Riprendiamoci Fiume!">RF</abbr></th>
              </tr>
            </thead>
            <tbody>
              @for (r of shown(); track r.user_id; let i = $index) {
                <tr [class.is-me]="r.user_id === auth.user()?.id">
                  <td class="app-board__pos">{{ i + 1 }}</td>
                  <th scope="row" class="app-board__name"><span class="app-board__user" [title]="'@' + r.username">&#64;{{ r.username }}</span></th>
                  <td class="app-board__num app-board__pts">{{ r.points }}</td>
                  <td class="app-board__num">{{ pm(r) }}</td>
                  <td class="app-board__num">{{ r.events }}</td>
                  <td class="app-board__num">{{ avg(r) }}</td>
                  <td class="app-board__num">{{ r.fiume_points ?? 0 }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > TOP) {
          <button type="button" class="app-board__more" (click)="showAll.set(!showAll())" [attr.aria-expanded]="showAll()">
            {{ showAll() ? 'Mostra solo i primi ' + TOP : 'Mostra tutta la classifica (' + rows().length + ')' }}
          </button>
        }
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
    .app-rank { max-width: 880px; margin: var(--space-6) auto 0; }
    .app-rank__title { margin: 0 0 var(--space-4); text-align: center; font-size: 31px; line-height: 36px; }
    .app-board { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); overflow-x: auto; box-shadow: var(--shadow-card); }
    .app-board__table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 20px; }
    .app-board__table th, .app-board__table td { padding: var(--space-3) var(--space-3); border-top: 1px solid var(--border); text-align: left; white-space: nowrap; }
    .app-board__table thead th { border-top: 0; font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); white-space: normal; vertical-align: bottom; }
    .app-board__table tbody tr.is-me { background: var(--accent-soft); }
    .app-board__pos { width: 36px; font-weight: 700; color: var(--muted); padding-left: var(--space-4) !important; }
    .app-board__name { font-weight: 700; }
    .app-board__num { text-align: right !important; font-variant-numeric: tabular-nums; }
    .app-board__table thead .app-board__num { max-width: 96px; }
    .app-board__table td.app-board__num:last-child, .app-board__table th:last-child { padding-right: var(--space-4); }
    .app-board__pts { font-weight: 800 !important; color: var(--ink) !important; }
    .app-board__short { display: none; }
    .app-board__table abbr { text-decoration: none; }
    .app-board__more { display: block; margin: var(--space-4) auto 0; min-height: 44px; padding: 0 var(--space-5); border: 1px solid var(--border); border-radius: 99px;
      background: var(--card-bg); color: var(--ink); font: inherit; font-weight: 700; cursor: pointer; }
    .app-board__more:hover { background: var(--surface-sunken); }
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
      .app-board__table { font-size: 14px; }
      .app-board__table th, .app-board__table td { padding: 10px 3px; }
      .app-board__pos { width: 18px; padding-left: 8px !important; }
      .app-board__table td.app-board__num:last-child, .app-board__table th:last-child { padding-right: 10px; }
      .app-board__user { display: block; max-width: 70px; overflow: hidden; text-overflow: ellipsis; }
      .app-board__table { font-size: 13px; }
      .app-board__long { display: none; }
      .app-board__short { display: inline; }
      .app-board__table thead th { font-size: 10px; letter-spacing: 0; }
    }
  `]
})
export class MinigamesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);
  rows = signal<LeaderRow[]>([]);
  loaded = signal(false);
  error = signal('');

  readonly TOP = 10;
  showAll = signal(false);
  readonly shown = computed(() => this.showAll() ? this.rows() : this.rows().slice(0, this.TOP));

  pm(r: LeaderRow) { return r.polymarket_points ?? r.points; }
  /** Punti Polymarket diviso numero di schedine (con un decimale). */
  avg(r: LeaderRow) { return r.events ? (this.pm(r) / r.events).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '–'; }

  async ngOnInit() {
    try { this.rows.set(await this.mg.leaderboard(1000)); }
    catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }
}
