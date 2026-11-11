import { AfterViewInit, Component, ElementRef, ViewChild, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MgEvent, Phrase, rvmLabel } from './minigame.service';
import { whenLabel } from './format';

/** Finestra aperta dal token «Polymarket» di un video: le formule vincenti dell'evento collegato. */
@Component({
  selector: 'app-polymarket-result-dialog',
  standalone: true,
  imports: [RouterLink],
  template: `
    <dialog #dlg class="pmd" (close)="closed.emit()" (click)="onBackdrop($event)" aria-labelledby="pmd-title">
      <div class="pmd__inner">
        <header class="pmd__head">
          <span class="pmd__brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18l5-6 4 3 7-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Polymarket</span>
          <button type="button" class="pmd__close" (click)="dlg.close()" aria-label="Chiudi">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
          </button>
        </header>
        <h2 class="pmd__title" id="pmd-title">{{ event().name }}</h2>
        <p class="pmd__when">{{ when() }}</p>

        <h3 class="pmd__sub">Formule vincenti</h3>
        @if (winners().length) {
          <ul class="pmd__chips">
            @for (p of winners(); track p.id) { <li class="pmd__chip">✓ {{ p.text }} <span>{{ p.points }} pt</span></li> }
          </ul>
        } @else {
          <p class="pmd__note">Fabbri non ha detto nessuna delle formule in lista.</p>
        }

        @if (tvs().length) {
          <h3 class="pmd__sub">RVM arrivati da</h3>
          <ul class="pmd__chips">@for (t of tvs(); track t) { <li class="pmd__chip pmd__chip--tv">{{ t }}</li> }</ul>
        }

        <a class="fc-btn fc-btn--primary pmd__go" [routerLink]="['/minigiochi/previsioni', event().id]" (click)="dlg.close()">Vedi risultati e classifica</a>
      </div>
    </dialog>
  `,
  styles: [`
    .pmd { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); color: var(--ink); box-shadow: var(--shadow-popover); }
    .pmd::backdrop { background: var(--scrim); }
    .pmd__inner { padding: var(--space-5) var(--space-6) var(--space-6); }
    .pmd__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
    .pmd__brand { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px 4px 8px; border-radius: var(--radius-pill); background: #1652f0; color: #fff; font-weight: 700; font-size: 14px; }
    .pmd__brand svg { width: 18px; height: 18px; }
    .pmd__close { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--ink); cursor: pointer; }
    .pmd__close svg { width: 16px; height: 16px; }
    .pmd__title { margin: 0; font-size: 23px; line-height: 30px; }
    .pmd__when { margin: var(--space-1) 0 0; color: var(--muted); font-size: 15px; }
    .pmd__when::first-letter { text-transform: uppercase; }
    .pmd__sub { margin: var(--space-5) 0 var(--space-2); font-size: 16px; }
    .pmd__note { margin: 0; color: var(--muted); }
    .pmd__chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .pmd__chip { padding: 6px 12px; border-radius: var(--radius-pill); background: #e3f4e8; color: #1d5c2e; font-weight: 700; font-size: 15px; }
    .pmd__chip span { font-weight: 400; font-size: 13px; opacity: .8; }
    .pmd__chip--tv { background: #eaf0fe; color: #1640b0; }
    .pmd__go { margin-top: var(--space-6); }
    @media (max-width: 639px) {
      .pmd { width: 100vw; max-width: 100vw; max-height: 92dvh; margin: auto 0 0; border-radius: var(--radius) var(--radius) 0 0; }
      .pmd__inner { padding: var(--space-4); }
    }
  `]
})
export class PolymarketResultDialogComponent implements AfterViewInit {
  readonly event = input.required<MgEvent>();
  readonly phrases = input<Map<number, Phrase>>(new Map());
  readonly closed = output<void>();
  @ViewChild('dlg') dlg!: ElementRef<HTMLDialogElement>;

  readonly winners = computed(() => (this.event().said_ids || []).map(id => this.phrases().get(id)).filter((p): p is Phrase => !!p).sort((a, b) => b.points - a.points));
  readonly tvs = computed(() => (this.event().rvm_sources || []).map(rvmLabel).filter(Boolean));
  readonly when = computed(() => whenLabel(this.event().starts_at));

  ngAfterViewInit() { this.dlg.nativeElement.showModal(); }
  onBackdrop(e: MouseEvent) { if (e.target === this.dlg.nativeElement) this.dlg.nativeElement.close(); }
}
