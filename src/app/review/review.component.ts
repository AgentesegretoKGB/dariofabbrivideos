import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { SafeUrlPipe } from '../catalog/safe-url.pipe';
import { AdminMinigamesComponent } from './admin-minigames.component';
import { AdminCalendarComponent } from './admin-calendar.component';
import { MgEvent, MinigameService } from '../minigames/minigame.service';
import { shortLabel } from '../minigames/format';

interface Video {
  id: number;
  title: string;
  date: string;
  url: string;
  tags: { [key: string]: string[] };
  pending?: boolean;
}

// Nota: questa è solo una barriera "leggera" per evitare che un visitatore
// casuale trovi la pagina, non una vera autenticazione. La password reale
// (lato server) viene controllata di nuovo dalla funzione /api/approve-video.
const REVIEW_PASSWORD = 'R3visione';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, SafeUrlPipe, AdminMinigamesComponent, AdminCalendarComponent],
  templateUrl: './review.component.html',
  styleUrls: ['./review.component.css']
})
export class ReviewComponent implements OnInit {
  constructor(private http: HttpClient, private mg: MinigameService) {}

  tab: 'video' | 'minigiochi' | 'calendario' = 'video';

  // ----- collegamento video → evento minigioco -----
  mgAdmin = false;
  mgAll: MgEvent[] = [];
  mgChoice: { [videoId: number]: string } = {};
  mgBusy: { [videoId: number]: boolean } = {};
  mgMessage: { [videoId: number]: { text: string; error: boolean } } = {};
  mgPaste: { [videoId: number]: string } = {};
  mgShowPaste: { [videoId: number]: boolean } = {};
  /** Evento da aprire nella scheda Minigiochi (dal pulsante «Conferma il minigioco»). */
  mgFocus: string | null = null;

  get mgEvents() { return this.mgAll.filter(e => e.status !== 'confirmed'); }

  async loadMgEvents() {
    try {
      this.mgAdmin = await this.mg.isAdmin();
      if (this.mgAdmin) this.mgAll = await this.mg.events();
    } catch { this.mgAdmin = false; }
  }

  mgLabel(e: MgEvent) { return `${e.name} — ${shortLabel(e.starts_at)}`; }

  /** Evento a cui è già collegato questo video (se c'è). */
  linkedEvent(v: Video): MgEvent | null {
    const yt = this.extractId(v.url);
    return (yt && this.mgAll.find(e => e.video_id === yt)) || null;
  }

  async linkToEvent(v: Video) {
    const eventId = this.mgChoice[v.id];
    const yt = this.extractId(v.url);
    if (!eventId || !yt) return;
    this.mgBusy[v.id] = true;
    this.mgMessage[v.id] = { text: '', error: false };
    try {
      const r = await this.mg.detectAndSave(eventId, { videoId: yt });
      this.mgMessage[v.id] = { text: `Collegato. Trovate ${r.found} formule nella ${r.source}: ora conferma il minigioco.`, error: false };
    } catch (e: any) {
      // trascrizione non disponibile: il video resta collegato e si può incollare il testo
      try { await this.mg.linkVideo(eventId, yt); } catch { }
      this.mgShowPaste[v.id] = true;
      this.mgMessage[v.id] = { text: 'Video collegato, ma YouTube non fornisce la trascrizione ai server. Incollala qui sotto (su YouTube: sotto il video «…altro» → «Mostra trascrizione», seleziona tutto e copia).', error: true };
    }
    await this.loadMgEvents();
    this.mgBusy[v.id] = false;
  }

  async detectFromPaste(v: Video) {
    const ev = this.linkedEvent(v) || this.mgAll.find(e => e.id === this.mgChoice[v.id]);
    const text = (this.mgPaste[v.id] || '').trim();
    if (!ev || !text) return;
    this.mgBusy[v.id] = true;
    try {
      const r = await this.mg.detectAndSave(ev.id, { videoId: this.extractId(v.url), text });
      this.mgPaste[v.id] = ''; this.mgShowPaste[v.id] = false;
      this.mgMessage[v.id] = { text: `Trovate ${r.found} formule nel testo incollato: ora conferma il minigioco.`, error: false };
      await this.loadMgEvents();
    } catch (e: any) { this.mgMessage[v.id] = { text: e.message, error: true }; }
    this.mgBusy[v.id] = false;
  }

  /** Apre la scheda Minigiochi sull'evento collegato, per controllare e confermare i punti. */
  openMinigame(e: MgEvent) {
    this.mgFocus = e.id;
    this.tab = 'minigiochi';
  }

  async backToVideos() {
    this.tab = 'video';
    this.mgFocus = null;
    await this.loadMgEvents();
    // i messaggi «ora conferma il minigioco» non servono più se l'evento è stato confermato
    for (const v of this.videos) {
      if (this.linkedEvent(v)?.status === 'confirmed') {
        delete this.mgMessage[v.id];
        if (this.rowStatus[v.id] === 'error') { this.rowStatus[v.id] = 'idle'; this.rowMessage[v.id] = ''; }
      }
    }
  }


  unlocked = false;
  passwordInput = '';
  passwordError = false;

  loading = true;
  loadError: string | null = null;
  videos: Video[] = [];

  // stato per riga: messaggi di salvataggio ed eventuali errori
  rowStatus: { [id: number]: 'idle' | 'saving' | 'done' | 'error' } = {};
  rowMessage: { [id: number]: string } = {};

  private extractId(url?: string): string | null {
    if (!url) return null;
    const u = url.trim();
    let m = u.match(/embed\/([^?&/]+)/i);
    if (!m) m = u.match(/youtu\.be\/([^?&/]+)/i);
    if (!m) m = u.match(/[?&]v=([^?&/]+)/i);
    return m ? m[1] : null;
  }

  buildEmbedUrl(url?: string): string {
    const id = this.extractId(url);
    if (!id) return '';
    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  }

  buildWatchUrl(url?: string): string {
    const id = this.extractId(url);
    if (!id) return url || '';
    const startMatch = (url || '').match(/[?&]start=(\d+)/i);
    const start = startMatch ? `&t=${startMatch[1]}s` : '';
    return `https://www.youtube.com/watch?v=${id}${start}`;
  }

  ngOnInit(): void {
    // non carichiamo nulla finché non sbloccato, per non esporre inutilmente i dati
  }

  tryUnlock() {
    if (this.passwordInput === REVIEW_PASSWORD) {
      this.unlocked = true;
      this.passwordError = false;
      this.loadPendingVideos();
      this.loadMgEvents();
    } else {
      this.passwordError = true;
    }
  }

  private loadPendingVideos() {
    this.loading = true;
    this.loadError = null;
    this.http.get<Video[]>('assets/videos.json').subscribe({
      next: (data) => {
        this.videos = (data || [])
          .filter(v => (v as any).pending)
          .map(v => ({
            ...v,
            tags: {
              format: [...(v.tags?.['format'] || [])],
              argomento: [...(v.tags?.['argomento'] || [])],
              categoria: [...(v.tags?.['categoria'] || [])]
            }
          }));
        this.loading = false;
      },
      error: (err) => {
        this.loadError = String(err);
        this.loading = false;
      }
    });
  }

  // helper per i campi tag come stringa separata da virgole nel form
  tagsAsString(v: Video, group: string): string {
    return (v.tags[group] || []).join(', ');
  }

  setTagsFromString(v: Video, group: string, value: string) {
    v.tags[group] = value
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  approve(v: Video) {
    const ev = this.linkedEvent(v);
    if (ev && ev.status !== 'confirmed') {
      this.rowStatus[v.id] = 'error';
      this.rowMessage[v.id] = 'Prima conferma il minigioco collegato a questo video.';
      return;
    }
    this.rowStatus[v.id] = 'saving';
    this.rowMessage[v.id] = '';
    this.http.post('/api/approve-video', {
      password: this.passwordInput,
      action: 'approve',
      video: v
    }).subscribe({
      next: () => {
        this.rowStatus[v.id] = 'done';
        this.rowMessage[v.id] = 'Approvato e pubblicato ✔';
        this.videos = this.videos.filter(x => x.id !== v.id);
      },
      error: (err) => {
        this.rowStatus[v.id] = 'error';
        this.rowMessage[v.id] = 'Errore: ' + (err?.error?.message || err.message || 'sconosciuto');
      }
    });
  }

  reject(v: Video) {
    if (!confirm(`Eliminare definitivamente "${v.title}"? Non è recuperabile.`)) return;
    this.rowStatus[v.id] = 'saving';
    this.rowMessage[v.id] = '';
    this.http.post('/api/approve-video', {
      password: this.passwordInput,
      action: 'reject',
      video: v
    }).subscribe({
      next: () => {
        this.rowStatus[v.id] = 'done';
        this.rowMessage[v.id] = 'Rimosso ✔';
        this.videos = this.videos.filter(x => x.id !== v.id);
      },
      error: (err) => {
        this.rowStatus[v.id] = 'error';
        this.rowMessage[v.id] = 'Errore: ' + (err?.error?.message || err.message || 'sconosciuto');
      }
    });
  }
}
