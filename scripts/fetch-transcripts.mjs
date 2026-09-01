// scripts/fetch-transcripts.mjs
// Scarica i sottotitoli automatici di YouTube per ogni video presente in
// src/assets/videos.json, e costruisce un indice unico ricercabile in
// transcripts/_all.json (usato dalla funzione di ricerca /api/search-transcripts).
//
// Non tutti i video hanno sottotitoli disponibili: quelli senza vengono
// semplicemente saltati (e riprovati alla prossima esecuzione).
//
// Eseguito manualmente da GitHub Actions (workflow_dispatch), perché può
// essere lento su cataloghi grandi e non è pensato per girare ogni giorno.

import fs from 'node:fs';
import path from 'node:path';

const VIDEOS_PATH = path.resolve('src/assets/videos.json');
const TRANSCRIPTS_DIR = path.resolve('transcripts');
const MANIFEST_PATH = path.join(TRANSCRIPTS_DIR, '_manifest.json');
const INDEX_PATH = path.join(TRANSCRIPTS_DIR, '_all.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractVideoId(url) {
  if (!url) return null;
  const m =
    url.match(/embed\/([^?&/]+)/i) ||
    url.match(/youtu\.be\/([^?&/]+)/i) ||
    url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

// Estrae l'array "captionTracks" dall'HTML della pagina di un video YouTube,
// contando le parentesi per trovare l'array JSON completo (più robusto di
// una singola regex non-greedy su contenuti che possono essere lunghi).
function extractCaptionTracks(html) {
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length; // qui inizia il carattere "["
  if (html[start] !== '[') return null;
  let depth = 0;
  let end = start;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const jsonText = html.slice(start, end);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function pickBestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;
  // Preferiamo i sottotitoli italiani (manuali o automatici), altrimenti il primo disponibile.
  return (
    tracks.find(t => t.languageCode === 'it' && t.kind !== 'asr') ||
    tracks.find(t => t.languageCode === 'it') ||
    tracks[0]
  );
}

async function fetchTranscriptForVideo(videoId) {
  const watchResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it-IT,it;q=0.9' }
  });
  if (!watchResp.ok) return null;
  const html = await watchResp.text();

  const tracks = extractCaptionTracks(html);
  const track = pickBestTrack(tracks);
  if (!track || !track.baseUrl) return null;

  const captionsResp = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!captionsResp.ok) return null;
  const data = await captionsResp.json();

  const segments = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    segments.push({
      start: Math.round((ev.tStartMs || 0) / 1000),
      text
    });
  }
  return segments.length > 0 ? segments : null;
}

async function main() {
  const videos = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));

  fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

  let manifest = { done: [], failed: [] };
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    // prima esecuzione: nessun manifest ancora
  }
  const doneSet = new Set(manifest.done);
  const failedSet = new Set(manifest.failed);

  // Carichiamo già l'indice esistente, se c'è, per aggiungerci solo le novità.
  let index = [];
  try {
    index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch {
    // primo indice
  }
  const indexByVideoId = new Map(index.map(e => [e.videoId, e]));

  const toProcess = videos.filter(v => {
    const id = extractVideoId(v.url);
    return id && !doneSet.has(id) && !failedSet.has(id) && !v.pending;
    // nota: i video ancora "pending" (non revisionati) li lasciamo per dopo,
    // così non trascriviamo cose che potresti ancora eliminare in revisione.
  });

  console.log(`Video da trascrivere in questa esecuzione: ${toProcess.length}`);

  // Limite di sicurezza per esecuzione (praticamente "tutti" per un catalogo di queste dimensioni).
  const BATCH_LIMIT = 5000;
  let processed = 0;
  let succeeded = 0;

  for (const v of toProcess) {
    if (processed >= BATCH_LIMIT) {
      console.log(`Raggiunto il limite di ${BATCH_LIMIT} per questa esecuzione, continuerà la prossima volta.`);
      break;
    }
    const videoId = extractVideoId(v.url);
    processed++;
    try {
      const segments = await fetchTranscriptForVideo(videoId);
      if (segments) {
        indexByVideoId.set(videoId, { videoId, title: v.title, segments });
        doneSet.add(videoId);
        succeeded++;
        console.log(`OK  #${v.id} ${v.title} (${segments.length} segmenti)`);
      } else {
        failedSet.add(videoId);
        console.log(`--  #${v.id} ${v.title}: nessun sottotitolo disponibile`);
      }
    } catch (err) {
      failedSet.add(videoId);
      console.log(`ERR #${v.id} ${v.title}: ${err}`);
    }
    // piccola pausa per non martellare YouTube di richieste
    await new Promise(r => setTimeout(r, 300));
  }

  const newIndex = Array.from(indexByVideoId.values());
  fs.writeFileSync(INDEX_PATH, JSON.stringify(newIndex), 'utf-8');
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ done: Array.from(doneSet), failed: Array.from(failedSet) }, null, 2),
    'utf-8'
  );

  console.log(`Completato: ${succeeded}/${processed} trascrizioni salvate in questa esecuzione.`);
  console.log(`Totale trascrizioni nell'indice: ${newIndex.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
