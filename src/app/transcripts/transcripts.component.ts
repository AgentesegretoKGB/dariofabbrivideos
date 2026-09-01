import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface SearchResult {
  videoId: string;
  title: string;
  timestampSeconds: number;
  snippet: string;
}

// Stessa "barriera leggera" della pagina di revisione: la vera password
// viene ricontrollata lato server da /api/search-transcripts.
const TRANSCRIPTS_PASSWORD = 'R3visione';

@Component({
  selector: 'app-transcripts',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './transcripts.component.html',
  styleUrls: ['./transcripts.component.css']
})
export class TranscriptsComponent {
  constructor(private http: HttpClient) {}

  unlocked = false;
  passwordInput = '';
  passwordError = false;

  query = '';
  searching = false;
  searchError: string | null = null;
  infoMessage: string | null = null;
  results: SearchResult[] = [];
  hasSearchedOnce = false;

  tryUnlock() {
    if (this.passwordInput === TRANSCRIPTS_PASSWORD) {
      this.unlocked = true;
      this.passwordError = false;
    } else {
      this.passwordError = true;
    }
  }

  search() {
    if (this.query.trim().length < 3) {
      this.searchError = 'Scrivi almeno 3 caratteri.';
      return;
    }
    this.searching = true;
    this.searchError = null;
    this.infoMessage = null;
    this.hasSearchedOnce = true;

    this.http.post<{ results: SearchResult[]; message?: string }>('/api/search-transcripts', {
      password: this.passwordInput,
      query: this.query.trim()
    }).subscribe({
      next: (res) => {
        this.results = res.results || [];
        this.infoMessage = res.message || null;
        this.searching = false;
      },
      error: (err) => {
        this.searchError = err?.error?.message || err.message || 'Errore sconosciuto';
        this.searching = false;
      }
    });
  }

  formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  watchUrl(result: SearchResult): string {
    return `https://www.youtube.com/watch?v=${result.videoId}&t=${result.timestampSeconds}s`;
  }
}
