import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { SafeUrlPipe } from '../catalog/safe-url.pipe';
import { CatalogVideo, CATEGORY_LABEL, decodeEntities, toCatalogVideo, youtubeThumb } from '../shared/catalog-video';

/** Un periodo (da punto a punto) che contiene la frase cercata. */
interface ApiHit { start: number; text: string; marks: [number, number][]; cutStart?: boolean; cutEnd?: boolean; }
interface ApiResult { videoId: string; title: string; matches: number; hits: ApiHit[]; }
interface ApiResponse { results: ApiResult[]; total?: number; truncated?: boolean; message?: string; }

/** Pezzo di testo: «bold» è la frase cercata. */
interface Piece { text: string; bold: boolean; }
interface Hit { start: number; time: string; pieces: Piece[]; cutStart: boolean; cutEnd: boolean; }

interface ResultCard {
  key: string;
  videoId: string;
  video: CatalogVideo | null;   // dati del catalogo (null se il video non è in videos.json)
  title: string;
  channel: string;
  poster?: string;
  meta: string;                 // «Formati · data»
  matches: number;
  hits: Hit[];
}

@Component({
  selector: 'app-transcripts',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, SafeUrlPipe],
  templateUrl: './transcripts.component.html',
  styleUrls: ['./transcripts.component.css']
})
export class TranscriptsComponent implements OnInit {
  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router) {}

  readonly categoryLabel = CATEGORY_LABEL;

  query = '';
  lastQuery = '';
  searching = false;
  searchError: string | null = null;
  infoMessage: string | null = null;
  results: ResultCard[] = [];
  total = 0;
  truncated = false;
  hasSearchedOnce = false;

  /** Video in riproduzione: chiave della card e secondo di partenza. */
  playing: { key: string; start: number; nonce: number } | null = null;

  private catalog = new Map<string, CatalogVideo>();
  catalogReady = false;

  // ---------- Filtri ----------
  filters = { category: '', format: '', topic: '', year: '' };
  formatOptions: string[] = [];
  topicOptions: string[] = [];
  yearOptions: string[] = [];
  readonly categoryOptions = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

  get activeFilters(): number { return Object.values(this.filters).filter(Boolean).length; }

  /** Video del catalogo che rispettano i filtri (null = nessun filtro attivo). */
  private allowedIds(): string[] | null {
    if (!this.activeFilters) return null;
    const f = this.filters;
    return [...this.catalog.values()].filter(v =>
      (!f.category || v.category === f.category) &&
      (!f.format || v.formats.includes(f.format)) &&
      (!f.topic || v.topics.includes(f.topic)) &&
      (!f.year || v.year === f.year)
    ).map(v => v.youtubeId!).filter(Boolean);
  }

  onFilterChange() { if (this.hasSearchedOnce && this.query.trim().length >= 3) this.search(); }

  clearFilters() { this.filters = { category: '', format: '', topic: '', year: '' }; this.onFilterChange(); }

  private buildFilterOptions() {
    const formats = new Set<string>(), topics = new Set<string>(), years = new Set<string>();
    for (const v of this.catalog.values()) {
      v.formats.forEach(x => formats.add(x)); v.topics.forEach(x => topics.add(x)); if (v.year) years.add(v.year);
    }
    const it = (a: string, b: string) => a.localeCompare(b, 'it');
    this.formatOptions = [...formats].sort(it);
    this.topicOptions = [...topics].sort(it);
    this.yearOptions = [...years].sort((a, b) => b.localeCompare(a));
  }
  private raw: ApiResult[] = [];

  ngOnInit(): void {
    // ?q=… nell'indirizzo: le ricerche si possono condividere con un link
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) { this.query = q; this.search(); }

    this.http.get<any[]>('assets/videos.json').subscribe({
      next: data => {
        for (const raw of data) {
          const v = toCatalogVideo(raw);
          if (v.youtubeId && v.title) this.catalog.set(v.youtubeId, v);
        }
        this.buildFilterOptions();
        this.catalogReady = true;
        // se la ricerca è arrivata prima del catalogo, completo le card
        if (this.raw.length) this.results = this.raw.map(r => this.card(r));
      },
      error: () => { /* senza catalogo mostriamo comunque i risultati con il titolo della trascrizione */ }
    });
  }

  search() {
    // gli spazi all'inizio/alla fine si tengono: «Nato » = parola intera
    const q = this.query.replace(/\s+/g, ' ');
    if (q.trim().length < 3) {
      this.searchError = 'Scrivi almeno 3 caratteri.';
      return;
    }
    this.searching = true;
    this.searchError = null;
    this.infoMessage = null;
    this.hasSearchedOnce = true;
    this.playing = null;

    this.router.navigate([], { relativeTo: this.route, queryParams: { q }, replaceUrl: true });

    const videoIds = this.allowedIds();
    if (videoIds && !videoIds.length) {
      this.lastQuery = q; this.raw = []; this.results = []; this.total = 0; this.truncated = false;
      this.infoMessage = 'Nessun video corrisponde ai filtri scelti.';
      this.searching = false;
      return;
    }
    this.http.post<ApiResponse>('/api/search-transcripts', videoIds ? { query: q, videoIds } : { query: q }).subscribe({
      next: (res) => {
        this.lastQuery = q;
        this.raw = res.results || [];
        this.results = this.raw.map(r => this.card(r));
        this.total = res.total ?? this.results.reduce((n, r) => n + r.matches, 0);
        this.truncated = !!res.truncated;
        this.infoMessage = res.message || null;
        this.searching = false;
      },
      error: (err) => {
        this.searchError = err?.error?.message || err.message || 'Errore sconosciuto';
        this.searching = false;
      }
    });
  }

  clearQuery() { this.query = ''; }

  // ---------- Player ----------

  play(r: ResultCard, start: number) {
    this.playing = { key: r.key, start, nonce: (this.playing?.nonce ?? 0) + 1 };
    // se il player non è visibile (periodi lunghi, telefono) lo riporto in vista
    setTimeout(() => {
      const el = document.getElementById('tr-player-' + r.key);
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.top < 56 || box.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  stop() { this.playing = null; }
  isPlaying(r: ResultCard) { return this.playing?.key === r.key; }
  isCurrent(r: ResultCard, h: Hit) { return this.isPlaying(r) && this.playing!.start === h.start; }

  embedUrl(r: ResultCard): string {
    const start = this.playing?.start ?? 0;
    // «nonce» forza il ricaricamento quando si clicca di nuovo lo stesso minuto
    return `https://www.youtube.com/embed/${r.videoId}?autoplay=1&rel=0&modestbranding=1&start=${start}&n=${this.playing?.nonce ?? 0}`;
  }

  // ---------- Costruzione card ----------

  private card(api: ApiResult): ResultCard {
    const video = this.catalog.get(api.videoId) || null;
    const meta = video
      ? [video.formats.join(', '), video.dateLabel].filter(Boolean).join(' · ')
      : '';
    return {
      key: api.videoId,
      videoId: api.videoId,
      video,
      title: video?.title || decodeEntities(api.title || ''),
      channel: video?.channel || '',
      poster: video?.poster || youtubeThumb(api.videoId),
      meta,
      matches: api.matches ?? api.hits.length,
      hits: api.hits.map(h => this.hit(h)),
    };
  }

  private hit(h: ApiHit): Hit {
    const pieces: Piece[] = [];
    let at = 0;
    const marks = [...(h.marks || [])].sort((a, b) => a[0] - b[0]);
    for (const [s, e] of marks) {
      if (s < at) continue;
      if (s > at) pieces.push({ text: h.text.slice(at, s), bold: false });
      pieces.push({ text: h.text.slice(s, e), bold: true });
      at = e;
    }
    if (at < h.text.length) pieces.push({ text: h.text.slice(at), bold: false });
    return { start: h.start, time: this.formatTimestamp(h.start), pieces, cutStart: !!h.cutStart, cutEnd: !!h.cutEnd };
  }

  formatTimestamp(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return h ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }
}
