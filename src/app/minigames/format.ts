const WHEN = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const SHORT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const whenLabel = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : WHEN.format(d); };
export const shortLabel = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : SHORT.format(d); };

/** «2 g 3 h», «4 h 12 min», «35 s» … tempo che manca a una data. */
export function countdown(iso: string, now = Date.now()): string {
  let s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d} g ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
