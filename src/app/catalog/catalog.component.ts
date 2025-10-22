import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { SafeUrlPipe } from './safe-url.pipe';

interface Video {
  id: number;
  title: string;
  date: string;
  url: string;
  poster?: string;
  tags: { [key: string]: string[] };
}

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, SafeUrlPipe],
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.css']
})
export class CatalogComponent implements OnInit {
  constructor(private http: HttpClient) {}
  searchText = '';
  monthText = '';
  selectedTags: { [group: string]: Set<string> } = {};
  // UI filters
  query = ''; // generic text search
  filterFormat = '';
  // argomento chips selection (multi)
  selectedArgomenti: Set<string> = new Set();
  // categoria filter: 'teoria' | 'attualita' (user choice)
  categoryFilter: '' | 'teoria' | 'attualita' = '';

  videos: Video[] = [];

  loading = true;
  loadError: string | null = null;

  // playing state: id of the video currently playing (video.id)
  playingId: number | null = null;

  // tagGroups will be populated from videos.json in a later improvement; start empty
  tagGroups: { [group: string]: string[] } = {};
  // ordering
  sortBy: 'newest' | 'oldest' | '' = 'newest';

  toggleTag(group: string, tag: string) {
    if (!this.selectedTags[group]) this.selectedTags[group] = new Set();
    if (this.selectedTags[group].has(tag)) this.selectedTags[group].delete(tag);
    else this.selectedTags[group].add(tag);
  }

  // argomento chips helpers
  get availableArgomenti(): string[] {
    const s = new Set<string>();
    for (const v of this.videos) {
      const arr = (v.tags && v.tags['argomento']) || [];
      for (const a of arr) s.add(a);
    }
    return Array.from(s).sort();
  }

  toggleArgomento(a: string) {
    if (this.selectedArgomenti.has(a)) this.selectedArgomenti.delete(a);
    else this.selectedArgomenti.add(a);
  }

  setCategory(cat: '' | 'teoria' | 'attualita'){
    this.categoryFilter = cat;
  }

  monthNameFromDate(dateIso: string) {
    const d = new Date(dateIso);
    return d.toLocaleString('default', { month: 'long' });
  }

  matchesMonth(video: Video) {
    if (!this.monthText) return true;
    return this.monthNameFromDate(video.date).toLowerCase().includes(this.monthText.toLowerCase());
  }

  matchesTags(video: Video) {
    for (const g of Object.keys(this.selectedTags)) {
      const sel = Array.from(this.selectedTags[g]);
      const videoTags = video.tags[g] || [];
      if (!sel.every(tag => videoTags.includes(tag))) return false;
    }
    return true;
  }

  applyFilters() {
    return this.videos
      .filter(v => this.matchesMonth(v) && this.matchesTags(v))
      .filter(v => {
        if (this.query) {
          const q = this.query.toLowerCase();
          if (!(v.title.toLowerCase().includes(q) || (v.tags && Object.values(v.tags).flat().join(' ').toLowerCase().includes(q)))) return false;
        }
        if (this.filterFormat) {
          const fm = (v.tags && v.tags['format'] || []).map((x: string) => x.toLowerCase());
          if (!fm.includes(this.filterFormat.toLowerCase())) return false;
        }

        // category filter: if video has categoria tag, require match; otherwise exclude when categoryFilter is set
        if (this.categoryFilter) {
          const cats = (v.tags && v.tags['categoria'] || []).map((x: string) => x.toLowerCase());
          if (!cats.includes(this.categoryFilter)) return false;
        }

        // argomento chips: if any selected, keep videos that have at least one of them
        if (this.selectedArgomenti.size > 0) {
          const videoArgs = (v.tags && v.tags['argomento'] || []).map((x: string) => x.toLowerCase());
          const sel = Array.from(this.selectedArgomenti).map(x => x.toLowerCase());
          const has = sel.some(s => videoArgs.includes(s));
          if (!has) return false;
        }
        return true;
      })
      .sort((a,b)=>{
        if(this.sortBy==='newest') return new Date(b.date).getTime() - new Date(a.date).getTime();
        if(this.sortBy==='oldest') return new Date(a.date).getTime() - new Date(b.date).getTime();
        return 0;
      });
  }

  ngOnInit(): void {
    this.loadAllVideos();
  }

  private loadAllVideos(){
    this.loading = true;
    this.loadError = null;
    this.http.get<Video[]>('/assets/videos.json').subscribe({
      next: (data: any[]) => {
        // Map incoming objects: normalize keys if needed
        this.videos = data.map(v => ({
          id: v.id,
          title: (v as any).title || (v as any).titolo || '',
          url: v.url,
          date: v.date,
          poster: this.extractYoutubeThumbnail(v.url),
          tags: v.tags || (v as any).tag && { argomento: (v as any).tag } || {}
        } as Video));
        this.loading = false;
      },
      error: (err: any) => {
        this.loadError = String(err);
        this.loading = false;
      }
    });
  }

  // extract YouTube video id from common URL forms and return a thumbnail URL
  private extractYoutubeThumbnail(url?: string): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    // common forms: https://www.youtube.com/watch?v=ID, https://youtu.be/ID, https://www.youtube.com/embed/ID
    // remove query params
    try {
      const u = url.trim();
      // try embed/ID
      let m = u.match(/embed\/([^?&/]+)/i);
      if (!m) m = u.match(/youtu\.be\/([^?&/]+)/i);
      if (!m) m = u.match(/[?&]v=([^?&/]+)/i);
      const id = m ? m[1] : null;
      if (!id) return undefined;
      return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    } catch (e) {
      return undefined;
    }
  }

  // build embed URL with autoplay when playing inline
  buildEmbedUrl(url?: string, autoplay = false): string {
    if (!url) return '';
    // extract id same as thumbnail
    const u = url.trim();
    let m = u.match(/embed\/([^?&/]+)/i);
    if (!m) m = u.match(/youtu\.be\/([^?&/]+)/i);
    if (!m) m = u.match(/[?&]v=([^?&/]+)/i);
    const id = m ? m[1] : null;
    if (!id) return '';
    const params = autoplay ? '?autoplay=1&rel=0&modestbranding=1' : '?rel=0&modestbranding=1';
    return `https://www.youtube.com/embed/${id}${params}`;
  }

  playVideo(v: Video) {
    this.playingId = v.id;
  }

  stopVideo() {
    this.playingId = null;
  }
}
