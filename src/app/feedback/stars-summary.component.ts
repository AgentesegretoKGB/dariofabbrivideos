import { Component, OnInit, computed, inject, input } from '@angular/core';
import { FeedbackService, ItemType } from './feedback.service';

/** Riga compatta: stelle piene in base alla media, il numero della media e quanti voti/commenti. */
@Component({
  selector: 'app-stars-summary',
  standalone: true,
  template: `
    <span class="app-ss" [attr.aria-label]="label()">
      <span class="app-ss__stars" aria-hidden="true">
        @for (s of [1,2,3,4,5]; track s) {
          <svg viewBox="0 0 24 24" class="app-ss__star"><defs><linearGradient [attr.id]="gid + s"><stop [attr.offset]="fill(s)" stop-color="currentColor"/><stop [attr.offset]="fill(s)" stop-color="transparent"/></linearGradient></defs>
            <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" [attr.fill]="'url(#' + gid + s + ')'" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        }
      </span>
      @if (st().avg != null) {
        @if (showAvg()) { <span class="app-ss__avg">{{ avgLabel() }}</span> }
        <span class="app-ss__count">({{ st().ratings }})</span>
      } @else {
        <span class="app-ss__count">Nessun voto</span>
      }
      @if (showComments() && st().comments) {
        <span class="app-ss__comments" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H9l-5 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>{{ st().comments }}
        </span>
      }
    </span>
  `,
  styles: [`
    .app-ss { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; line-height: 18px; color: var(--muted); white-space: nowrap; }
    .app-ss__stars { display: inline-flex; gap: 1px; color: #c58a00; }
    .app-ss__star { width: 16px; height: 16px; display: block; }
    .app-ss__avg { font-weight: 700; color: var(--ink); }
    .app-ss__comments { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; }
    .app-ss__comments svg { width: 15px; height: 15px; }
  `]
})
export class StarsSummaryComponent implements OnInit {
  private fb = inject(FeedbackService);
  readonly type = input.required<ItemType>();
  readonly itemId = input.required<string>();
  readonly showComments = input(true);
  readonly showAvg = input(true);
  readonly gid = 'ssg' + Math.random().toString(36).slice(2, 8);

  readonly st = computed(() => this.fb.stats(this.type(), this.itemId()));
  readonly avgLabel = computed(() => (this.st().avg ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  readonly label = computed(() => {
    const s = this.st();
    const v = s.avg == null ? 'nessun voto' : `media ${this.avgLabel()} su 5, ${s.ratings} ${s.ratings === 1 ? 'voto' : 'voti'}`;
    return this.showComments() ? `${v}, ${s.comments} ${s.comments === 1 ? 'commento' : 'commenti'}` : v;
  });

  fill(s: number): string {
    const a = this.st().avg ?? 0;
    return Math.round(Math.max(0, Math.min(1, a - (s - 1))) * 100) + '%';
  }

  ngOnInit() { this.fb.loadStats(this.type()); }
}
