// Normalizzazione condivisa dei video di assets/videos.json.
// Usata dal catalogo e dalla ricerca nelle trascrizioni, così le due pagine
// mostrano esattamente le stesse informazioni per ogni video.

export type Category = '' | 'teoria' | 'attualita';

export interface CatalogVideo {
  id: number;
  youtubeId: string | null;
  title: string;
  date: string;
  url: string;
  channel: string;
  poster?: string;
  formats: string[];
  topics: string[];
  category: Category;
  year: string;
  dateLabel: string;
  haystack: string;
  pending?: boolean;
}

export const CATEGORY_LABEL: { [k: string]: string } = { teoria: 'Teoria', attualita: 'Attualità' };

/** Grafie diverse dello stesso formato. */
const FORMAT_ALIASES: { [lower: string]: string } = { 'il grande gioco': 'Il Grande Gioco' };
/** Valori finiti tra gli argomenti che in realtà sono formati («Limes» è un formato, distinto da «Approfondimento Limes»). */
const TOPICS_AS_FORMATS: { [lower: string]: string } = { 'limes': 'Limes' };
const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/embed\/([^?&/]+)/i) || url.match(/youtu\.be\/([^?&/]+)/i) || url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

export function youtubeThumb(id: string | null): string | undefined {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}

/** Decodifica le entità HTML che a volte arrivano da YouTube (es. «&#39;», «&amp;»). */
export function decodeEntities(s: string): string {
  if (!s || !s.includes('&')) return s;
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

export function toCatalogVideo(v: any): CatalogVideo {
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
  const title = decodeEntities((v.title || v.titolo || '').trim());
  const channel = decodeEntities((v.channel || '').trim());
  const d = v.date ? new Date(v.date) : null;
  const valid = !!d && !isNaN(d.getTime());
  const yt = youtubeId(v.url);
  return {
    id: v.id,
    youtubeId: yt,
    title,
    url: v.url,
    channel,
    date: v.date || '',
    poster: youtubeThumb(yt),
    formats,
    topics,
    category,
    year: valid ? String(d!.getFullYear()) : '',
    dateLabel: valid ? DATE_FMT.format(d!) : '',
    haystack: norm([title, channel, ...formats, ...topics, CATEGORY_LABEL[category] || ''].join(' ')),
    pending: !!v.pending,
  };
}
