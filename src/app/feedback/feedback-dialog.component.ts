import { AfterViewInit, Component, ElementRef, ViewChild, input, output } from '@angular/core';
import { ItemType } from './feedback.service';
import { FeedbackPanelComponent } from './feedback-panel.component';

/** Finestra sopra la pagina con voto e commenti di un elemento. */
@Component({
  selector: 'app-feedback-dialog',
  standalone: true,
  imports: [FeedbackPanelComponent],
  template: `
    <dialog #dlg class="app-fbd" (close)="closed.emit()" (click)="onBackdrop($event)" [attr.aria-label]="'Valutazioni e commenti: ' + heading()">
      <div class="app-fbd__inner">
        <header class="app-fbd__head">
          <h2 class="app-fbd__title">{{ heading() }}</h2>
          <button type="button" class="app-fbd__close" (click)="dlg.close()" aria-label="Chiudi">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
          </button>
        </header>
        <app-feedback [type]="type()" [itemId]="itemId()" />
      </div>
    </dialog>
  `,
  styles: [`
    .app-fbd { width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card-bg); color: var(--ink); box-shadow: var(--shadow-popover); }
    .app-fbd::backdrop { background: var(--scrim); }
    .app-fbd__inner { padding: var(--space-5) var(--space-6) var(--space-6); }
    .app-fbd__head { display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-4); }
    .app-fbd__title { flex: 1; margin: 0; font-size: 21px; line-height: 28px; }
    .app-fbd__close { flex: none; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--ink); cursor: pointer; }
    .app-fbd__close svg { width: 16px; height: 16px; }
    @media (max-width: 639px) {
      .app-fbd { width: 100vw; max-width: 100vw; max-height: 92dvh; margin: auto 0 0; border-radius: var(--radius) var(--radius) 0 0; }
      .app-fbd__inner { padding: var(--space-4); }
    }
  `]
})
export class FeedbackDialogComponent implements AfterViewInit {
  readonly type = input.required<ItemType>();
  readonly itemId = input.required<string>();
  readonly heading = input('');
  readonly focusComment = input(false);
  readonly closed = output<void>();
  @ViewChild('dlg') dlg!: ElementRef<HTMLDialogElement>;

  ngAfterViewInit() {
    const d = this.dlg.nativeElement;
    d.showModal();
    if (this.focusComment()) {
      // Porta subito ai commenti: casella di testo se si può scrivere, altrimenti la sezione
      let tries = 0;
      const go = () => {
        const ta = d.querySelector('textarea') as HTMLTextAreaElement | null;
        if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); return; }
        if (++tries < 20) setTimeout(go, 100);
        else d.querySelector('.app-fb-comments, .app-fb-note')?.scrollIntoView({ block: 'start' });
      };
      setTimeout(go, 50);
    }
  }

  onBackdrop(e: MouseEvent) { if (e.target === this.dlg.nativeElement) this.dlg.nativeElement.close(); }
}
