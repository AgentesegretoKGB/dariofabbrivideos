import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './review.component.html',
  styleUrls: ['./review.component.css']
})
export class ReviewComponent implements OnInit {
  constructor(private http: HttpClient) {}

  unlocked = false;
  passwordInput = '';
  passwordError = false;

  loading = true;
  loadError: string | null = null;
  videos: Video[] = [];

  // stato per riga: messaggi di salvataggio ed eventuali errori
  rowStatus: { [id: number]: 'idle' | 'saving' | 'done' | 'error' } = {};
  rowMessage: { [id: number]: string } = {};

  ngOnInit(): void {
    // non carichiamo nulla finché non sbloccato, per non esporre inutilmente i dati
  }

  tryUnlock() {
    if (this.passwordInput === REVIEW_PASSWORD) {
      this.unlocked = true;
      this.passwordError = false;
      this.loadPendingVideos();
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
