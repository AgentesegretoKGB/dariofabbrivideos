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
const REJECTED_IDS_PATH = path.resolve('src/assets/rejected-ids.json');
const SEARCH_QUERIES = ['Dario Fabbri'];
const MAX_RESULTS = 25;

// Canali che ripubblicano contenuti (di solito doppioni di bassa qualità) da escludere sempre.
const CHANNEL_BLACKLIST = [
  'pensierolibero',
  'l analista del potere',
  'polemos',
  'mondi in movimento'
];

// Canali su cui vogliamo scorrere TUTTO l'archivio di upload (in ordine cronologico
// dal più recente), filtrando noi stessi per "fabbri" nel titolo. Molto più affidabile
// della ricerca testuale di YouTube su canali con moltissimi video (es. La7), che si è
// dimostrata inaffidabile e restituiva 0 risultati anche quando i video esistevano.
const CHANNEL_DEEP_SCANS = [
  { handle: 'La7', maxPages: 40 },
  { handle: 'la7attualita', maxPages: 40 },
  { handle: 'TgLa7', maxPages: 40 }
];

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

function guessFormat(title, channelTitle) {
  const t = title.toLowerCase();
  const ch = (channelTitle || '').toLowerCase();
  // La7 pubblica spesso brevi interventi TV di Fabbri: li marchiamo sempre come TV,
  // indipendentemente dalla durata (possono durare pochi minuti).
  if (ch.includes('la7')) return ['TV'];
  if (t.includes('grande gioco')) return ['Il Grande Gioco'];
  if (t.includes('assemblea')) return ['Assemblea'];
  if (t.includes('intervista')) return ['Intervista'];
  return ['Incontro'];
}

// Sinonimi/parole chiave che implicano un argomento anche se il nome non compare
// letteralmente nel titolo (es. "Trump" implica l'argomento "USA").
const ARGOMENTO_SYNONYMS = {
  usa: ['trump', 'biden', 'casa bianca', 'washington', 'pentagono', 'cia ', ' fbi'],
  russia: ['putin', 'mosca', 'cremlino'],
  cina: ['xi jinping', 'pechino'],
  ucraina: ['zelensky', 'kiev', 'kyiv'],
  'medio oriente': ['netanyahu', 'gaza', 'hamas', 'israele', 'iran', 'teheran', 'hezbollah']
};

// Prova a indovinare UN SOLO argomento dal titolo, dando priorità agli argomenti
// già usati nel catalogo (per restare coerenti con quelli che usi già tu).
function guessArgomento(title, existingArgomenti) {
  const norm = normalizeTitle(title);
  const existingNorm = existingArgomenti
    .map(a => ({ original: a, norm: normalizeTitle(a) }))
    .filter(e => e.norm.length > 0)
    .sort((a, b) => b.norm.length - a.norm.length); // match più specifico prima

  // 1. il titolo contiene già, letteralmente, il nome di un argomento esistente
  for (const e of existingNorm) {
    if (norm.includes(e.norm)) return [e.original];
  }

  // 2. il titolo contiene una parola chiave che implica un argomento (es. "Trump" -> USA)
  for (const [concept, keywords] of Object.entries(ARGOMENTO_SYNONYMS)) {
    if (keywords.some(k => norm.includes(k.trim()))) {
      const match = existingNorm.find(e => e.norm === concept || e.norm.includes(concept));
      if (match) return [match.original];
      // se questo argomento non esiste ancora nel catalogo, lo proponiamo comunque
      return [concept.replace(/\b\w/g, c => c.toUpperCase())];
    }
  }

  return []; // nessun indizio chiaro: meglio vuoto che sbagliato, lo compili tu
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

async function youtubeSearch(query) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', String(MAX_RESULTS));

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Errore ricerca YouTube ("${query}"): ` + (await resp.text()));
  const json = await resp.json();
  return (json.items || []).map(it => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    channelTitle: it.snippet.channelTitle,
    publishedAt: it.snippet.publishedAt,
    description: it.snippet.description
  }));
}

async function getUploadsPlaylistId(handle) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('forHandle', handle);

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`Errore risolvendo il canale @${handle}: ` + (await resp.text()));
    return null;
  }
  const json = await resp.json();
  const item = json.items && json.items[0];
  return item ? item.contentDetails.relatedPlaylists.uploads : null;
}

// Scorre la playlist di tutti gli upload del canale (dal più recente), pagina per
// pagina, tenendo solo i video con "fabbri" nel titolo. Si ferma da sola quando,
// per una pagina intera, non trova più nulla di nuovo/rilevante: questo evita di
// ripercorrere sempre tutto l'archivio nelle esecuzioni successive alla prima.
async function scanUploadsForKeyword(playlistId, keyword, maxPages, alreadyKnownIds) {
  const matches = [];
  let pageToken = '';
  for (let page = 0; page < maxPages; page++) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Errore leggendo la playlist upload (${playlistId}): ` + (await resp.text()));
    const json = await resp.json();
    const items = json.items || [];

    let newInThisPage = 0;
    for (const it of items) {
      const videoId = it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title || '';
      if (!videoId) continue;
      if (!alreadyKnownIds.has(videoId)) newInThisPage++;
      if (normalizeTitle(title).includes(keyword)) {
        matches.push({
          videoId,
          title,
          channelTitle: it.snippet.channelTitle,
          publishedAt: it.snippet.publishedAt,
          description: '',
          trustedChannel: true
        });
      }
    }

    if (!json.nextPageToken) break;
    // Se in questa pagina non c'era NESSUN video nuovo rispetto a quelli già noti,
    // molto probabilmente abbiamo raggiunto la parte di archivio già esplorata in
    // esecuzioni precedenti: ci fermiamo per non consumare quota/tempo inutilmente.
    if (page > 0 && newInThisPage === 0) break;
    pageToken = json.nextPageToken;
  }
  return matches;
}

async function youtubeSearchAll(alreadyKnownIds) {
  const seen = new Map();

  for (const q of SEARCH_QUERIES) {
    const items = await youtubeSearch(q);
    console.log(`Ricerca generica "${q}": ${items.length} risultati.`);
    for (const it of items) {
      if (!seen.has(it.videoId)) seen.set(it.videoId, it);
    }
  }

  for (const cfg of CHANNEL_DEEP_SCANS) {
    const playlistId = await getUploadsPlaylistId(cfg.handle);
    if (!playlistId) {
      console.error(`Canale @${cfg.handle} NON TROVATO (controlla che l'handle sia corretto), salto la scansione.`);
      continue;
    }
    console.log(`Canale @${cfg.handle}: playlist upload trovata (${playlistId}), scorro l'archivio...`);
    const items = await scanUploadsForKeyword(playlistId, 'fabbri', cfg.maxPages, alreadyKnownIds);
    console.log(`Scansione @${cfg.handle}: trovati ${items.length} video con "fabbri" nel titolo.`);
    for (const it of items) {
      if (!seen.has(it.videoId)) seen.set(it.videoId, it);
    }
  }

  console.log(`Totale risultati unici (prima di ogni filtro): ${seen.size}`);
  return Array.from(seen.values());
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

async function isYoutubeShort(videoId) {
  try {
    // YouTube risponde 200 con la pagina dedicata se è davvero uno Short/Reel;
    // se invece è un video normale (anche breve), risponde con un redirect verso /watch.
    // Questo è più affidabile della sola durata, perché video TV brevi (es. La7)
    // possono durare pochi minuti pur non essendo Reel.
    const resp = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'GET',
      redirect: 'manual'
    });
    return resp.status === 200;
  } catch {
    return false; // in caso di dubbio/errore di rete, non lo blocchiamo
  }
}

async function main() {
  const raw = fs.readFileSync(VIDEOS_PATH, 'utf-8');
  const videos = JSON.parse(raw);

  let rejectedIds = [];
  try {
    rejectedIds = JSON.parse(fs.readFileSync(REJECTED_IDS_PATH, 'utf-8'));
  } catch {
    // file non ancora esistente o vuoto: nessun problema, partiamo da lista vuota
  }
  const rejectedSet = new Set(rejectedIds);

  const existingIds = new Set(
    videos.map(v => extractVideoId(v.url)).filter(Boolean)
  );
  const existingTitles = videos.map(v => normalizeTitle(v.title));
  const alreadyKnownIds = new Set([...existingIds, ...rejectedSet]);

  const results = await youtubeSearchAll(alreadyKnownIds);

  let excludedBlacklist = 0;
  let excludedNoName = 0;
  let excludedDuplicate = 0;

  const candidates = results.filter(r => {
    if (existingIds.has(r.videoId)) return false; // stesso video già presente
    if (rejectedSet.has(r.videoId)) return false; // già rifiutato in passato in revisione
    const normChannel = normalizeTitle(r.channelTitle).replace(/\s+/g, '');
    if (CHANNEL_BLACKLIST.some(bad => normChannel.includes(bad.replace(/\s+/g, '')))) {
      excludedBlacklist++;
      return false;
    }
    const norm = normalizeTitle(r.title);
    if (!r.trustedChannel && !norm.includes('dario fabbri')) {
      excludedNoName++;
      return false;
    }
    const isDuplicateTitle = existingTitles.some(et => similarity(et, norm) >= 0.82);
    if (isDuplicateTitle) {
      excludedDuplicate++;
      return false;
    }
    return true;
  });

  console.log(`Candidati dopo i filtri: ${candidates.length}`);
  console.log(`  - esclusi per canale in blacklist: ${excludedBlacklist}`);
  console.log(`  - esclusi perché il titolo non contiene "Dario Fabbri": ${excludedNoName}`);
  console.log(`  - esclusi come doppioni di titolo già in catalogo: ${excludedDuplicate}`);

  if (candidates.length === 0) {
    console.log('Nessun video nuovo trovato.');
    return;
  }

  // Verifica reale (non solo la durata) se ogni candidato è uno Short/Reel.
  const shortChecks = await Promise.all(candidates.map(c => isYoutubeShort(c.videoId)));
  const candidatesNoShorts = candidates.filter((c, i) => !shortChecks[i]);

  const skippedShorts = candidates.length - candidatesNoShorts.length;
  if (skippedShorts > 0) {
    console.log(`Scartati ${skippedShorts} YouTube Shorts/Reel.`);
  }

  const existingArgomenti = Array.from(
    new Set(videos.flatMap(v => (v.tags && v.tags.argomento) || []))
  );

  let nextId = Math.max(0, ...videos.map(v => v.id)) + 1;

  const newEntries = candidatesNoShorts.map(c => {
    const entry = {
      id: nextId++,
      title: cleanTitle(c.title),
      url: `https://www.youtube.com/embed/${c.videoId}`,
      date: c.publishedAt.slice(0, 10), // fallback: data di pubblicazione su YouTube
      tags: {
        format: guessFormat(c.title, c.channelTitle),
        argomento: guessArgomento(c.title, existingArgomenti),
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
