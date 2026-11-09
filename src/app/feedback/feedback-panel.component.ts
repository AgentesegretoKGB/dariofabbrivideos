import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { FeedbackService, ItemComment, ItemType } from './feedback.service';
import { StarsSummaryComponent } from './stars-summary.component';

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Voto a stelle + commenti per un video o una mappa. */
@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [FormsModule, RouterLink, StarsSummaryComponent],
  templateUrl: './feedback-panel.component.html',
  styleUrls: ['./feedback-panel.component.css']
})
export class FeedbackPanelComponent implements OnChanges {
  readonly auth = inject(AuthService);
  readonly fb = inject(FeedbackService);
  readonly type = input.required<ItemType>();
  readonly itemId = input.required<string>();

  readonly mine = computed(() => this.fb.myRating(this.type(), this.itemId()));
  readonly stats = computed(() => this.fb.stats(this.type(), this.itemId()));
  hover = signal(0);
  rateMsg = signal('');
  rating = signal(false);

  comments = signal<ItemComment[]>([]);
  loadingComments = signal(true);
  draft = '';
  posting = signal(false);
  commentMsg = signal('');

  readonly starLabels = ['Pessimo', 'Scarso', 'Discreto', 'Buono', 'Ottimo'];

  ngOnChanges() {
    this.fb.loadStats(this.type());
    this.fb.loadMine(this.type());
    this.loadComments();
  }

  async loadComments() {
    this.loadingComments.set(true);
    try { this.comments.set(await this.fb.comments(this.type(), this.itemId())); }
    catch { this.comments.set([]); }
    this.loadingComments.set(false);
  }

  async rate(stars: number) {
    if (this.rating()) return;
    this.rating.set(true); this.rateMsg.set('');
    const err = await this.fb.rate(this.type(), this.itemId(), stars);
    this.rating.set(false);
    this.rateMsg.set(err ?? (stars ? 'Grazie, voto salvato.' : 'Voto tolto.'));
  }

  async post() {
    this.posting.set(true); this.commentMsg.set('');
    const err = await this.fb.addComment(this.type(), this.itemId(), this.draft);
    this.posting.set(false);
    if (err) { this.commentMsg.set(err); return; }
    this.draft = '';
    await this.loadComments();
  }

  async remove(c: ItemComment) {
    if (!confirm('Vuoi cancellare questo commento?')) return;
    const err = await this.fb.deleteComment(this.type(), this.itemId(), c.id);
    if (err) { this.commentMsg.set(err); return; }
    this.comments.update(list => list.filter(x => x.id !== c.id));
  }

  date(s: string) { const d = new Date(s); return isNaN(d.getTime()) ? '' : DATE_FMT.format(d); }
  avgLabel() { return (this.stats().avg ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
}
