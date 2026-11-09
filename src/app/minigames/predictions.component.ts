import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MgEvent, MinigameService } from './minigame.service';
import { countdown, whenLabel } from './format';

@Component({
  selector: 'app-predictions',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="app-back" routerLink="/minigiochi">← Minigiochi</a>
    <header class="app-pr-head">
      <h1 class="app-pr-title">Cosa dirà Fabbri?</h1>
      <p class="app-pr-desc">Scegli un evento e compila la tua schedina con fino a 5 formule. Si chiude all'orario d'inizio.</p>
    </header>

    @if (error()) { <p class="app-note">{{ error() }}</p> }
    @else if (!loaded()) { <p class="app-note">Carico gli eventi…</p> }
    @else {
      @for (g of groups(); track g.title) {
        @if (g.items.length) {
          <section>
            <h2 class="fc-section-title">{{ g.title }}</h2>
            <div class="app-ev-list">
              @for (e of g.items; track e.id) {
                <a class="app-ev" [routerLink]="['/minigiochi/previsioni', e.id]">
                  <div class="app-ev__main">
                    <h3 class="app-ev__name">{{ e.name }}</h3>
                    <p class="app-ev__when">{{ when(e.starts_at) }}</p>
                  </div>
                  <div class="app-ev__side">
                    @if (open(e)) {
                      <span class="app-badge app-badge--open">Chiude tra {{ cd(e.starts_at) }}</span>
                    } @else if (e.status === 'confirmed') {
                      <span class="app-badge app-badge--done">Risultati</span>
                    } @else {
                      <span class="app-badge">In attesa dei risultati</span>
                    }
                    @if (mine().has(e.id)) { <span class="app-ev__mine">✓ La tua schedina</span> }
                  </div>
                </a>
              }
            </div>
          </section>
        }
      }
      @if (!events().length) { <p class="app-note">Non ci sono ancora eventi. Torna presto!</p> }
    }
  `,
  styles: [`
    .app-back { display: inline-block; margin-top: var(--space-2); color: var(--ink); font-size: 15px; }
    .app-note { color: var(--muted); margin-top: var(--space-6); }
    .app-pr-head { margin-top: var(--space-4); }
    .app-pr-title { margin: 0; font-size: 31px; line-height: 36px; }
    .app-pr-desc { margin: var(--space-2) 0 0; color: var(--muted); }
    .app-ev-list { display: flex; flex-direction: column; gap: var(--space-3); }
    .app-ev { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-5);
      background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--ink); text-decoration: none; }
    .app-ev:hover { border-color: var(--border-control); box-shadow: var(--shadow-card-hover); }
    .app-ev__name { margin: 0; font-size: 19px; line-height: 26px; }
    .app-ev__when { margin: var(--space-1) 0 0; color: var(--muted); font-size: 15px; }
    .app-ev__side { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); flex: none; }
    .app-ev__mine { font-size: 14px; font-weight: 700; color: var(--success-ink); }
    .app-badge { padding: 4px 12px; border-radius: var(--radius-pill); background: var(--surface-sunken); font-size: 14px; font-weight: 700; white-space: nowrap; }
    .app-badge--open { background: var(--ink); color: var(--white); }
    .app-badge--done { background: var(--success-surface); color: var(--success-ink); }
    @media (max-width: 639px) {
      .app-pr-title { font-size: 25px; line-height: 32px; }
      .app-ev { flex-direction: column; align-items: flex-start; padding: var(--space-4); }
      .app-ev__side { align-items: flex-start; }
    }
  `]
})
export class PredictionsComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private mg = inject(MinigameService);
  events = signal<MgEvent[]>([]);
  mine = signal<Map<string, number[]>>(new Map());
  loaded = signal(false);
  error = signal('');
  now = signal(Date.now());
  private timer: any;

  readonly groups = computed(() => {
    const now = this.now(), all = this.events();
    const upcoming = all.filter(e => new Date(e.starts_at).getTime() > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const waiting = all.filter(e => new Date(e.starts_at).getTime() <= now && e.status !== 'confirmed');
    const done = all.filter(e => new Date(e.starts_at).getTime() <= now && e.status === 'confirmed');
    return [{ title: 'Schedine aperte', items: upcoming }, { title: 'In attesa dei risultati', items: waiting }, { title: 'Conclusi', items: done }];
  });

  async ngOnInit() {
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    try {
      this.events.set(await this.mg.events());
      this.mine.set(await this.mg.myEntries());
    } catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  open(e: MgEvent) { return new Date(e.starts_at).getTime() > this.now(); }
  cd(iso: string) { return countdown(iso, this.now()); }
  when(iso: string) { return whenLabel(iso); }
}
