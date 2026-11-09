import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { FeedbackPanelComponent } from '../feedback/feedback-panel.component';
import { MapItem, MapsService, editorLink } from './maps.service';

@Component({
  selector: 'app-map-detail',
  standalone: true,
  imports: [RouterLink, FeedbackPanelComponent],
  template: `
    <a class="app-md-back" routerLink="/mappe">← Tutte le mappe</a>
    @if (loading()) {
      <p class="app-md-note">Un momento…</p>
    } @else if (map(); as m) {
      <article class="app-md">
        <header class="app-md__head">
          <div>
            <h1 class="app-md__title">{{ m.title }}</h1>
            @if (m.author) { <p class="app-md__author">di &#64;{{ m.author }}</p> }
          </div>
          <div class="app-md__actions">
            <a class="fc-btn fc-btn--primary" [href]="editor(m)" target="_blank" rel="noopener">Apri nell'editor</a>
            @if (m.userId && m.userId === auth.user()?.id) {
              <button type="button" class="fc-btn fc-btn--secondary" (click)="remove(m)" [disabled]="removing()">Cancella mappa</button>
            }
          </div>
        </header>
        <a class="app-md__preview" [href]="editor(m)" target="_blank" rel="noopener" [attr.aria-label]="'Apri ' + m.title + ' nell\\'editor'">
          <img [src]="m.preview" [alt]="'Anteprima della mappa ' + m.title" />
        </a>
        @if (error()) { <p class="app-md-note app-md-note--error" role="alert">{{ error() }}</p> }
        <div class="app-md__feedback">
          <app-feedback type="map" [itemId]="m.id" />
        </div>
      </article>
    } @else {
      <p class="app-md-note">Mappa non trovata.</p>
    }
  `,
  styles: [`
    .app-md-back { display: inline-block; margin-top: var(--space-2); color: var(--ink); font-size: 15px; }
    .app-md-note { margin-top: var(--space-6); color: var(--muted); }
    .app-md-note--error { color: var(--danger); }
    .app-md { margin-top: var(--space-4); }
    .app-md__head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
    .app-md__title { margin: 0; font-size: 31px; line-height: 36px; }
    .app-md__author { margin: var(--space-1) 0 0; color: var(--muted); font-style: italic; }
    .app-md__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
    .app-md__preview { display: block; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-sunken); box-shadow: var(--shadow-card); }
    .app-md__preview img { display: block; width: 100%; height: auto; }
    .app-md__feedback { max-width: 760px; margin-top: var(--space-6); padding: var(--space-5) var(--space-6); background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); }
    @media (max-width: 639px) {
      .app-md__title { font-size: 25px; line-height: 32px; }
      .app-md__actions, .app-md__actions .fc-btn { width: 100%; }
      .app-md__feedback { padding: var(--space-4); }
    }
  `]
})
export class MapDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private svc = inject(MapsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  map = signal<MapItem | null>(null);
  loading = signal(true);
  removing = signal(false);
  error = signal('');

  ngOnInit() {
    this.route.paramMap.subscribe(async p => {
      this.loading.set(true);
      this.map.set(await this.svc.find(p.get('id') || ''));
      this.loading.set(false);
    });
  }

  editor(m: MapItem) { return editorLink(m); }

  async remove(m: MapItem) {
    if (!confirm(`Vuoi cancellare la mappa "${m.title}"? Non si può annullare.`)) return;
    this.removing.set(true);
    const err = await this.svc.remove(m);
    this.removing.set(false);
    if (err) { this.error.set(err); return; }
    this.router.navigate(['/mappe']);
  }
}
