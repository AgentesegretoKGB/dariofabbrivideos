import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { SafeUrlPipe } from '../catalog/safe-url.pipe';
import { CatalogVideo, Category, CATEGORY_LABEL, decodeEntities, norm, toCatalogVideo, youtubeThumb } from '../shared/catalog-video';

type Facet = 'categoria' | 'formato' | 'argomento' | 'anno';
type Sort = 'relevance' | 'newest' | 'oldest';
interface Option { value: string; label: string; count: number; selected: boolean; }
interface ActiveFilter { key: string; label: string; remove: () => void; }
const SORT_LABEL: { [k in Sort]: string } = { relevance: 'Più pertinenti', newest: 'Più recenti', oldest: 'Meno recenti' };

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

  // ---------- Filtri (stessa logica e stessa grafica del catalogo) ----------
  readonly sortLabel = SORT_LABEL;
  readonly sorts: Sort[] = ['relevance', 'newest', 'oldest'];
  category: Category = '';
  formats = new Set<string>();
  topics = new Set<string>();
  years = new Set<string>();
  sortBy: Sort = 'relevance';
  openMenu: Facet | 'ordina' | null = null;
  sheetOpen = false;
  topicSearch = '';
  sheetShowAll: { [k: string]: boolean } = {};
  options: { [k in Facet]: Option[] } = { categoria: [], formato: [], argomento: [], anno: [] };
  /** Video del catalogo che rispettano i filtri (per i conteggi e per la ricerca). */
  filtered: CatalogVideo[] = [];

  private matchesFilters(v: CatalogVideo, skip?: Facet): boolean {
    if (skip !== 'categoria' && this.category && v.category !== this.category) return false;
    if (skip !== 'formato' && this.formats.size && !v.formats.some(f => this.formats.has(f))) return false;
    if (skip !== 'argomento' && this.topics.size && !v.topics.some(x => this.topics.has(x))) return false;
    if (skip !== 'anno' && this.years.size && !this.years.has(v.year)) return false;
    return true;
  }

  /** Ricalcola conteggi e video ammessi; se c'è già una ricerca la ripete. */
  recomputeFilters(rerun = true) {
    const all = [...this.catalog.values()];
    this.filtered = all.filter(v => this.matchesFilters(v));
    const count = (facet: Facet, values: (v: CatalogVideo) => string[]) => {
      const m = new Map<string, number>();
      for (const v of all) for (const x of values(v)) if (x && !m.has(x)) m.set(x, 0);
      for (const v of all) if (this.matchesFilters(v, facet)) for (const x of values(v)) if (x) m.set(x, (m.get(x) || 0) + 1);
      return m;
    };
    const cats = count('categoria', v => [v.category]);
    this.options.categoria = ['teoria', 'attualita'].map(c => ({ value: c, label: CATEGORY_LABEL[c], count: cats.get(c) || 0, selected: this.category === c }));
    const byCount = (a: Option, b: Option) => b.count - a.count || a.label.localeCompare(b.label, 'it');
    this.options.formato = [...count('formato', v => v.formats).entries()].map(([f, n]) => ({ value: f, label: f, count: n, selected: this.formats.has(f) })).sort(byCount);
    this.options.argomento = [...count('argomento', v => v.topics).entries()].map(([x, n]) => ({ value: x, label: x, count: n, selected: this.topics.has(x) })).sort(byCount);
    this.options.anno = [...count('anno', v => [v.year]).entries()].map(([y, n]) => ({ value: y, label: y, count: n, selected: this.years.has(y) })).sort((a, b) => b.value.localeCompare(a.value));
    if (rerun && this.hasSearchedOnce && this.query.trim().length >= 3) this.search();
  }

  get topicOptions(): Option[] {
    const q = norm(this.topicSearch);
    return q ? this.options.argomento.filter(o => norm(o.label).includes(q)) : this.options.argomento;
  }
  get selectedTopicOptions(): Option[] { return this.topicSearch ? [] : this.options.argomento.filter(o => o.selected); }
  get unselectedTopicOptions(): Option[] { return this.topicSearch ? this.topicOptions : this.options.argomento.filter(o => !o.selected); }

  setCategoryExact(c: Category) { this.category = c; this.recomputeFilters(); }
  toggle(facet: 'formato' | 'argomento' | 'anno', value: string) {
    const set = facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years;
    set.has(value) ? set.delete(value) : set.add(value);
    this.recomputeFilters();
  }
  clearFacet(facet: Facet) {
    if (facet === 'categoria') this.category = '';
    if (facet === 'formato') this.formats.clear();
    if (facet === 'argomento') { this.topics.clear(); this.topicSearch = ''; }
    if (facet === 'anno') this.years.clear();
    this.recomputeFilters();
  }
  clearAll() { this.category = ''; this.formats.clear(); this.topics.clear(); this.years.clear(); this.topicSearch = ''; this.recomputeFilters(); }
  setSort(s: Sort) { this.sortBy = s; this.openMenu = null; if (this.hasSearchedOnce && this.query.trim().length >= 3) this.search(); }

  facetCount(facet: Facet): number {
    if (facet === 'categoria') return this.category ? 1 : 0;
    return (facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years).size;
  }
  facetValue(facet: Facet): string {
    if (facet === 'categoria') return this.category ? CATEGORY_LABEL[this.category] : '';
    const set = facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years;
    return set.size === 1 ? [...set][0] : '';
  }
  get activeCount(): number { return (this.category ? 1 : 0) + this.formats.size + this.topics.size + this.years.size; }
  get activeFilters(): ActiveFilter[] {
    const out: ActiveFilter[] = [];
    if (this.category) out.push({ key: 'Categoria', label: CATEGORY_LABEL[this.category], remove: () => this.clearFacet('categoria') });
    this.formats.forEach(f => out.push({ key: 'Formato', label: f, remove: () => this.toggle('formato', f) }));
    this.topics.forEach(x => out.push({ key: 'Argomento', label: x, remove: () => this.toggle('argomento', x) }));
    this.years.forEach(y => out.push({ key: 'Anno', label: y, remove: () => this.toggle('anno', y) }));
    return out;
  }
  opts(f: string): Option[] { return this.options[f as Facet] || []; }

  toggleMenu(m: Facet | 'ordina', ev: Event) {
    ev.stopPropagation();
    this.openMenu = this.openMenu === m ? null : m;
    if (m === 'argomento') this.topicSearch = '';
  }
  openSheet() { this.sheetOpen = true; this.openMenu = null; document.body.style.overflow = 'hidden'; }
  closeSheet() { this.sheetOpen = false; document.body.style.overflow = ''; }
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) { if (this.openMenu && !(ev.target as HTMLElement)?.closest('.app-filter')) this.openMenu = null; }
  @HostListener('document:keydown.escape')
  onEscape() { if (this.openMenu) this.openMenu = null; else if (this.sheetOpen) this.closeSheet(); }
  @HostListener('window:resize')
  onResize() { if (this.sheetOpen && window.innerWidth >= 640) this.closeSheet(); }

  /** Elenco dei video da mandare al server: null se non serve (nessun filtro e ordine per pertinenza). */
  private requestIds(): string[] | null {
    if (!this.activeCount && this.sortBy === 'relevance') return null;
    const list = [...this.filtered];
    if (this.sortBy !== 'relevance') {
      list.sort((a, b) => { const d = (a.date || '').localeCompare(b.date || ''); return this.sortBy === 'oldest' ? d : -d; });
    }
    return list.map(v => v.youtubeId!).filter(Boolean);
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
        this.catalogReady = true;
        this.recomputeFilters(false);
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

    const videoIds = this.catalogReady ? this.requestIds() : null;
    if (videoIds && !videoIds.length) {
      this.lastQuery = q; this.raw = []; this.results = []; this.total = 0; this.truncated = false;
      this.infoMessage = 'Nessun video corrisponde ai filtri scelti.';
      this.searching = false;
      return;
    }
    const body: any = { query: q };
    if (videoIds) { body.videoIds = videoIds; if (this.sortBy !== 'relevance') body.sort = 'list'; }
    this.http.post<ApiResponse>('/api/search-transcripts', body).subscribe({
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
