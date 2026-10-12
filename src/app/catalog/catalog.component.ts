import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { SafeUrlPipe } from './safe-url.pipe';

interface Video {
  id: number;
  title: string;
  date: string;
  url: string;
  poster?: string;
  formats: string[];
  topics: string[];
  category: '' | 'teoria' | 'attualita';
  year: string;
  dateLabel: string;
  haystack: string;
  pending?: boolean;
}

type Category = '' | 'teoria' | 'attualita';
type Sort = 'newest' | 'oldest' | 'title';
type Facet = 'categoria' | 'formato' | 'argomento' | 'anno';

export interface Option { value: string; label: string; count: number; selected: boolean; }
export interface ActiveFilter { key: string; label: string; remove: () => void; }

const PAGE_SIZE = 24;
const CATEGORY_LABEL: { [k: string]: string } = { teoria: 'Teoria', attualita: 'Attualità' };
const SORT_LABEL: { [k in Sort]: string } = { newest: 'Più recenti', oldest: 'Più vecchi', title: 'Titolo A–Z' };
// Varianti di scrittura presenti in videos.json, ricondotte a un'unica etichetta.
const FORMAT_ALIASES: { [lower: string]: string } = { 'il grande gioco': 'Il Grande Gioco' };
// Valori catalogati come argomento che in realtà sono formati: vengono spostati tra i formati.
const TOPICS_AS_FORMATS: { [lower: string]: string } = { 'limes': 'Limes' };
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, SafeUrlPipe],
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.css']
})
export class CatalogComponent implements OnInit {
  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router) {}

  readonly sortLabel = SORT_LABEL;
  readonly categoryLabel = CATEGORY_LABEL;

  videos: Video[] = [];
  loading = true;
  loadError: string | null = null;
  playingId: number | null = null;

  // Stato dei filtri
  query = '';
  category: Category = '';
  formats = new Set<string>();
  topics = new Set<string>();
  years = new Set<string>();
  sortBy: Sort = 'newest';

  // Stato dell'interfaccia
  openMenu: Facet | 'ordina' | null = null;
  sheetOpen = false;
  topicSearch = '';
  sheetShowAll: { [k: string]: boolean } = {};
  visibleCount = PAGE_SIZE;

  // Cache dei risultati
  results: Video[] = [];
  options: { [k in Facet]: Option[] } = { categoria: [], formato: [], argomento: [], anno: [] };

  ngOnInit(): void {
    this.readUrl();
    this.http.get<any[]>('assets/videos.json').subscribe({
      next: data => {
        this.videos = data.map(v => this.toVideo(v)).filter(v => v.title);
        this.loading = false;
        this.recompute(false);
      },
      error: err => {
        this.loadError = String(err?.message ?? err);
        this.loading = false;
      }
    });
  }

  private toVideo(v: any): Video {
    const tags = v.tags || {};
    const formats = Array.from(new Set<string>((tags.format || [])
      .map((f: string) => (f || '').trim()).filter(Boolean)
      .map((f: string) => FORMAT_ALIASES[f.toLowerCase()] ?? f)));
    const rawTopics: string[] = (tags.argomento || []).map((a: string) => (a || '').trim()).filter(Boolean);
    for (const a of rawTopics) {
      const asFormat = TOPICS_AS_FORMATS[a.toLowerCase()];
      if (asFormat && !formats.includes(asFormat)) formats.push(asFormat);
    }
    const topics = Array.from(new Set<string>(rawTopics.filter(a => !TOPICS_AS_FORMATS[a.toLowerCase()])));
    const cat = norm((tags.categoria || [])[0] || '');
    const category: Category = cat === 'teoria' || cat === 'attualita' ? cat : '';
    const title = (v.title || v.titolo || '').trim();
    const d = v.date ? new Date(v.date) : null;
    const valid = d && !isNaN(d.getTime());
    return {
      id: v.id,
      title,
      url: v.url,
      date: v.date || '',
      poster: this.youtubeThumb(v.url),
      formats,
      topics,
      category,
      year: valid ? String(d!.getFullYear()) : '',
      dateLabel: valid ? DATE_FMT.format(d!) : '',
      haystack: norm([title, ...formats, ...topics, CATEGORY_LABEL[category] || ''].join(' ')),
      pending: !!v.pending,
    };
  }

  // ---------- Filtri ----------

  private matches(v: Video, skip?: Facet): boolean {
    if (this.query) {
      const words = norm(this.query).split(/\s+/).filter(Boolean);
      if (!words.every(w => v.haystack.includes(w))) return false;
    }
    if (skip !== 'categoria' && this.category && v.category !== this.category) return false;
    if (skip !== 'formato' && this.formats.size && !v.formats.some(f => this.formats.has(f))) return false;
    if (skip !== 'argomento' && this.topics.size && !v.topics.some(t => this.topics.has(t))) return false;
    if (skip !== 'anno' && this.years.size && !this.years.has(v.year)) return false;
    return true;
  }

  /** Ricalcola risultati e conteggi. I conteggi di ogni filtro tengono conto di tutti gli altri. */
  recompute(resetPage = true) {
    if (resetPage) this.visibleCount = PAGE_SIZE;
    const sorted = this.videos.filter(v => this.matches(v));
    sorted.sort((a, b) => {
      if (this.sortBy === 'title') return a.title.localeCompare(b.title, 'it');
      const diff = (a.date || '').localeCompare(b.date || '');
      return this.sortBy === 'oldest' ? diff : -diff;
    });
    this.results = sorted;

    const count = (facet: Facet, values: (v: Video) => string[]) => {
      const all = new Map<string, number>();
      for (const v of this.videos) for (const x of values(v)) if (x && !all.has(x)) all.set(x, 0);
      for (const v of this.videos) if (this.matches(v, facet)) for (const x of values(v)) if (x) all.set(x, (all.get(x) || 0) + 1);
      return all;
    };

    const cats = count('categoria', v => [v.category]);
    this.options.categoria = ['teoria', 'attualita'].map(c => ({ value: c, label: CATEGORY_LABEL[c], count: cats.get(c) || 0, selected: this.category === c }));

    const fm = count('formato', v => v.formats);
    this.options.formato = [...fm.entries()].map(([f, n]) => ({ value: f, label: f, count: n, selected: this.formats.has(f) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'));

    const tp = count('argomento', v => v.topics);
    this.options.argomento = [...tp.entries()].map(([t, n]) => ({ value: t, label: t, count: n, selected: this.topics.has(t) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'));

    const yr = count('anno', v => [v.year]);
    this.options.anno = [...yr.entries()].map(([y, n]) => ({ value: y, label: y, count: n, selected: this.years.has(y) }))
      .sort((a, b) => b.value.localeCompare(a.value));

    this.writeUrl();
  }

  get visible(): Video[] { return this.results.slice(0, this.visibleCount); }
  showMore() { this.visibleCount += PAGE_SIZE; }

  get topicOptions(): Option[] {
    const q = norm(this.topicSearch);
    const list = this.options.argomento;
    return q ? list.filter(o => norm(o.label).includes(q)) : list;
  }
  get selectedTopicOptions(): Option[] { return this.topicSearch ? [] : this.options.argomento.filter(o => o.selected); }
  get unselectedTopicOptions(): Option[] { return this.topicSearch ? this.topicOptions : this.options.argomento.filter(o => !o.selected); }

  setQuery(q: string) { this.query = q; this.recompute(); }
  setCategory(c: Category) { this.category = this.category === c ? '' : c; this.recompute(); }
  setCategoryExact(c: Category) { this.category = c; this.recompute(); }
  toggle(facet: 'formato' | 'argomento' | 'anno', value: string) {
    const set = facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years;
    set.has(value) ? set.delete(value) : set.add(value);
    this.recompute();
  }
  clearFacet(facet: Facet) {
    if (facet === 'categoria') this.category = '';
    if (facet === 'formato') this.formats.clear();
    if (facet === 'argomento') { this.topics.clear(); this.topicSearch = ''; }
    if (facet === 'anno') this.years.clear();
    this.recompute();
  }
  setSort(s: Sort) { this.sortBy = s; this.openMenu = null; this.recompute(); }
  clearAll() {
    this.query = ''; this.category = ''; this.formats.clear(); this.topics.clear(); this.years.clear(); this.topicSearch = '';
    this.recompute();
  }

  facetCount(facet: Facet): number {
    if (facet === 'categoria') return this.category ? 1 : 0;
    return (facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years).size;
  }
  /** Con un solo valore il pulsante mostra il valore; con più valori mostra il numero. */
  facetValue(facet: Facet): string {
    if (facet === 'categoria') return this.category ? CATEGORY_LABEL[this.category] : '';
    const set = facet === 'formato' ? this.formats : facet === 'argomento' ? this.topics : this.years;
    return set.size === 1 ? [...set][0] : '';
  }
  get activeCount(): number {
    return (this.category ? 1 : 0) + this.formats.size + this.topics.size + this.years.size;
  }

  get activeFilters(): ActiveFilter[] {
    const out: ActiveFilter[] = [];
    if (this.query) out.push({ key: 'Ricerca', label: this.query, remove: () => this.setQuery('') });
    if (this.category) out.push({ key: 'Categoria', label: CATEGORY_LABEL[this.category], remove: () => this.clearFacet('categoria') });
    this.formats.forEach(f => out.push({ key: 'Formato', label: f, remove: () => this.toggle('formato', f) }));
    this.topics.forEach(t => out.push({ key: 'Argomento', label: t, remove: () => this.toggle('argomento', t) }));
    this.years.forEach(y => out.push({ key: 'Anno', label: y, remove: () => this.toggle('anno', y) }));
    return out;
  }

  // ---------- Menu e pannello ----------

  toggleMenu(m: Facet | 'ordina', ev: Event) {
    ev.stopPropagation();
    this.openMenu = this.openMenu === m ? null : m;
    if (m === 'argomento') this.topicSearch = '';
  }
  openSheet() { this.sheetOpen = true; this.openMenu = null; document.body.style.overflow = 'hidden'; }
  closeSheet() { this.sheetOpen = false; document.body.style.overflow = ''; }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (this.openMenu && !(ev.target as HTMLElement)?.closest('.app-filter')) this.openMenu = null;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.openMenu) this.openMenu = null;
    else if (this.sheetOpen) this.closeSheet();
  }

  @HostListener('window:resize')
  onResize() {
    if (this.sheetOpen && window.innerWidth >= 640) this.closeSheet();
  }

  // ---------- URL ----------

  private readUrl() {
    const p = this.route.snapshot.queryParamMap;
    this.query = p.get('q') || '';
    const c = p.get('categoria');
    this.category = c === 'teoria' || c === 'attualita' ? c : '';
    const list = (k: string) => (p.get(k) || '').split(',').map(s => s.trim()).filter(Boolean);
    this.pendingSlugs = { formato: list('formato'), argomento: list('argomento') };
    list('anno').forEach(y => this.years.add(y));
    const o = p.get('ordine');
    this.sortBy = o === 'oldest' || o === 'title' ? o : 'newest';
  }
  private pendingSlugs: { formato: string[]; argomento: string[] } | null = null;

  private writeUrl() {
    if (this.pendingSlugs) {
      // Le etichette si conoscono solo dopo aver caricato i dati.
      const bySlug = (vals: string[]) => new Map(vals.map(v => [slug(v), v]));
      const fm = bySlug(this.options.formato.map(o => o.value));
      const tp = bySlug(this.options.argomento.map(o => o.value));
      this.pendingSlugs.formato.forEach(s => fm.has(s) && this.formats.add(fm.get(s)!));
      this.pendingSlugs.argomento.forEach(s => tp.has(s) && this.topics.add(tp.get(s)!));
      this.pendingSlugs = null;
      this.recompute(false);
      return;
    }
    const queryParams: any = {
      q: this.query || null,
      categoria: this.category || null,
      formato: this.formats.size ? [...this.formats].map(slug).join(',') : null,
      argomento: this.topics.size ? [...this.topics].map(slug).join(',') : null,
      anno: this.years.size ? [...this.years].join(',') : null,
      ordine: this.sortBy !== 'newest' ? this.sortBy : null,
    };
    this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
  }

  // ---------- Video ----------

  private youtubeId(url?: string): string | null {
    if (!url) return null;
    const m = url.match(/embed\/([^?&/]+)/i) || url.match(/youtu\.be\/([^?&/]+)/i) || url.match(/[?&]v=([^?&/]+)/i);
    return m ? m[1] : null;
  }
  private youtubeThumb(url?: string) {
    const id = this.youtubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
  }
  buildEmbedUrl(url?: string): string {
    const id = this.youtubeId(url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1` : '';
  }
  playVideo(v: Video) { this.playingId = v.id; }
  stopVideo() { this.playingId = null; }

  opts(f: string): Option[] { return this.options[f as Facet] || []; }
  sortName(s: string): string { return SORT_LABEL[s as Sort]; }
}
