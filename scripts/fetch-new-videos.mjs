// scripts/fetch-new-videos.mjs
// Cerca su YouTube nuovi video di/con Dario Fabbri, scarta i doppioni già
// presenti nel catalogo (o molto simili per titolo), classifica il formato
// con poche regole semplici, e aggiunge le nuove voci come "pending": true.
//
// Richiede: process.env.YOUTUBE_API_KEY
// Eseguito da: .github/workflows/fetch-videos.yml

import fs from 'node:fs';
import path from 'node:path';

const VIDEOS_PATH = path.resolve('src/assets/videos.json');
const SEARCH_QUERY = 'Dario Fabbri';
const MAX_RESULTS = 25;

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('Manca YOUTUBE_API_KEY');
  process.exit(1);
}

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Similarità semplice tra due stringhe (coefficiente di Dice su bigrammi)
function similarity(a, b) {
  const bigrams = (s) => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return a === b ? 1 : 0;
  let matches = 0;
  const BCopy = [...B];
  for (const g of A) {
    const idx = BCopy.indexOf(g);
    if (idx !== -1) {
      matches++;
      BCopy.splice(idx, 1);
    }
  }
  return (2 * matches) / (A.length + B.length);
}

function extractVideoId(url) {
  if (!url) return null;
  const m =
    url.match(/embed\/([^?&/]+)/i) ||
    url.match(/youtu\.be\/([^?&/]+)/i) ||
    url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

function cleanTitle(title) {
  let t = title;
  // Rimuove pattern comuni tipo "Dario Fabbri | Titolo", "Titolo - Dario Fabbri",
  // "Titolo | Dario Fabbri", "Dario Fabbri: Titolo" ecc.
  // Non tocca frasi dove il nome è parte integrante (es. "X intervista Dario Fabbri a...").
  const patterns = [
    /^\s*dario\s+fabbri\s*[\|\-:–]\s*/i,
    /\s*[\|\-:–]\s*dario\s+fabbri\s*$/i,
    /^\s*fabbri\s*[\|\-:–]\s*/i,
    /\s*[\|\-:–]\s*fabbri\s*$/i
  ];
  for (const re of patterns) t = t.replace(re, '');
  return t.trim();
}

function guessFormat(title, durationSeconds) {
  const t = title.toLowerCase();
  if (t.includes('grande gioco')) return ['Il Grande Gioco'];
  if (t.includes('assemblea')) return ['Assemblea'];
  if (t.includes('intervista')) return ['Intervista'];
  if (durationSeconds && durationSeconds <= 30 * 60) return ['Assemblea'];
  return ['Incontro'];
}

function parseIsoDurationToSeconds(iso) {
  // es. PT1H2M10S
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

async function youtubeSearch() {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('q', SEARCH_QUERY);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', String(MAX_RESULTS));

  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Errore ricerca YouTube: ' + (await resp.text()));
  const json = await resp.json();
  return (json.items || []).map(it => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    publishedAt: it.snippet.publishedAt,
    description: it.snippet.description
  }));
}

async function youtubeVideoDetails(videoIds) {
  if (videoIds.length === 0) return {};
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('part', 'contentDetails');

  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Errore dettagli video: ' + (await resp.text()));
  const json = await resp.json();
  const map = {};
  for (const item of json.items || []) {
    map[item.id] = parseIsoDurationToSeconds(item.contentDetails?.duration);
  }
  return map;
}

async function main() {
  const raw = fs.readFileSync(VIDEOS_PATH, 'utf-8');
  const videos = JSON.parse(raw);

  const existingIds = new Set(
    videos.map(v => extractVideoId(v.url)).filter(Boolean)
  );
  const existingTitles = videos.map(v => normalizeTitle(v.title));

  const results = await youtubeSearch();

  const candidates = results.filter(r => {
    if (existingIds.has(r.videoId)) return false; // stesso video già presente
    const norm = normalizeTitle(r.title);
    const isDuplicateTitle = existingTitles.some(et => similarity(et, norm) >= 0.82);
    return !isDuplicateTitle;
  });

  if (candidates.length === 0) {
    console.log('Nessun video nuovo trovato.');
    return;
  }

  const durations = await youtubeVideoDetails(candidates.map(c => c.videoId));

  // Scarta gli YouTube Shorts: per policy di YouTube durano al massimo 3 minuti (180s).
  // Se per qualche motivo la durata non è disponibile, lo teniamo (meglio in dubbio che perso).
  const SHORTS_MAX_SECONDS = 180;
  const candidatesNoShorts = candidates.filter(c => {
    const d = durations[c.videoId];
    return d === undefined || d === null || d > SHORTS_MAX_SECONDS;
  });

  const skippedShorts = candidates.length - candidatesNoShorts.length;
  if (skippedShorts > 0) {
    console.log(`Scartati ${skippedShorts} YouTube Shorts.`);
  }

  let nextId = Math.max(0, ...videos.map(v => v.id)) + 1;

  const newEntries = candidatesNoShorts.map(c => {
    const duration = durations[c.videoId];
    const entry = {
      id: nextId++,
      title: cleanTitle(c.title),
      url: `https://www.youtube.com/embed/${c.videoId}`,
      date: c.publishedAt.slice(0, 10), // fallback: data di pubblicazione su YouTube
      tags: {
        format: guessFormat(c.title, duration),
        argomento: [],
        categoria: []
      },
      pending: true
    };
    return entry;
  });

  const updated = [...videos, ...newEntries];
  fs.writeFileSync(VIDEOS_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf-8');

  console.log(`Aggiunti ${newEntries.length} nuovi video (pending):`);
  for (const e of newEntries) console.log(` - #${e.id} ${e.title}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
