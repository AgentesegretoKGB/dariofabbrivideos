import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { LeaderRow, MinigameService } from './minigame.service';

@Component({
  selector: 'app-minigames',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1 class="app-mg-hidden">Minigiochi</h1>
    <a class="app-game" routerLink="/minigiochi/previsioni">
      <div class="app-game__art" aria-hidden="true">
        <span class="app-game__q">“…<strong>al di là delle chiacchiere</strong>…”</span>
        <span class="app-game__chips"><span>+5</span><span>+2</span><span>+8</span></span>
      </div>
      <div class="app-game__text">
        <h2 class="app-game__title">Cosa dirà Fabbri?</h2>
        <p class="app-game__desc">Prima di ogni evento scegli fino a 5 modi di dire, formule e parole che secondo te Fabbri pronuncerà. Più l'espressione è rara, più punti vale. Le schedine si chiudono all'orario d'inizio.</p>
        <span class="fc-btn fc-btn--primary">Gioca</span>
      </div>
    </a>

    <section aria-labelledby="classifica">
      <h2 class="fc-section-title" id="classifica">Classifica generale</h2>
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
              <span class="app-board__meta">{{ r.events }} {{ r.events === 1 ? 'evento' : 'eventi' }} · {{ r.hits }} indovinate</span>
              <span class="app-board__pts">{{ r.points }} pt</span>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [`
    .app-mg-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .app-mg-note { color: var(--muted); }
    .app-game { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--space-6); align-items: center; margin-top: var(--space-4); padding: var(--space-6);
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card); color: var(--ink); text-decoration: none; }
    .app-game:hover { border-color: var(--border-control); box-shadow: var(--shadow-card-hover); }
    .app-game__art { aspect-ratio: 4 / 3; border-radius: var(--radius-md); background: var(--ink); color: var(--white); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-5); padding: var(--space-5); text-align: center; }
    .app-game__q { font-size: 22px; line-height: 30px; font-style: italic; }
    .app-game__q strong { color: #f3c969; font-style: normal; }
    .app-game__chips { display: flex; gap: var(--space-2); }
    .app-game__chips span { padding: 4px 12px; border-radius: var(--radius-pill); background: rgba(255,255,255,.14); font-weight: 700; }
    .app-game__title { margin: 0 0 var(--space-3); font-size: 31px; line-height: 36px; }
    .app-game__desc { margin: 0 0 var(--space-5); color: var(--muted); font-size: 17px; line-height: 26px; }
    .app-board { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); overflow: hidden; }
    .app-board__row { display: grid; grid-template-columns: 40px 1fr auto auto; gap: var(--space-3); align-items: center; padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
    .app-board__row:first-child { border-top: 0; }
    .app-board__row.is-me { background: var(--accent-soft); }
    .app-board__pos { font-weight: 700; color: var(--muted); }
    .app-board__name { font-weight: 700; }
    .app-board__meta { font-size: 14px; color: var(--muted); }
    .app-board__pts { font-weight: 700; min-width: 60px; text-align: right; }
    @media (max-width: 639px) {
      .app-game { grid-template-columns: 1fr; padding: var(--space-4); }
      .app-game__title { font-size: 25px; line-height: 32px; }
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

  async ngOnInit() {
    try { this.rows.set(await this.mg.leaderboard(50)); }
    catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }
}
