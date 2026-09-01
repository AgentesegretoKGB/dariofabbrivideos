// scripts/fetch-transcripts.mjs
// Scarica i sottotitoli automatici di YouTube per ogni video presente in
// src/assets/videos.json, e costruisce un indice unico ricercabile in
// transcripts/_all.json (usato dalla funzione di ricerca /api/search-transcripts).
//
// Usa la libreria "youtube-transcript" (mantenuta dalla comunità), molto più
// robusta di una richiesta HTTP scritta a mano: YouTube cambia periodicamente
// le protezioni anti-bot, e una libreria mantenuta si aggiorna di conseguenza.
//
// Non tutti i video hanno sottotitoli disponibili: quelli senza vengono
// semplicemente saltati (e riprovati alla prossima esecuzione).
//
// IMPORTANTE: funziona meglio lanciato dal proprio computer (connessione
// "normale") piuttosto che dai server di GitHub Actions, che YouTube a volte
// tratta in modo più restrittivo essendo indirizzi di datacenter.

import fs from 'node:fs';
import path from 'node:path';
import { YoutubeTranscript } from 'youtube-transcript';

const VIDEOS_PATH = path.resolve('src/assets/videos.json');
const TRANSCRIPTS_DIR = path.resolve('transcripts');
const MANIFEST_PATH = path.join(TRANSCRIPTS_DIR, '_manifest.json');
const INDEX_PATH = path.join(TRANSCRIPTS_DIR, '_all.json');

function extractVideoId(url) {
  if (!url) return null;
  const m =
    url.match(/embed\/([^?&/]+)/i) ||
    url.match(/youtu\.be\/([^?&/]+)/i) ||
    url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

async function fetchTranscriptForVideo(videoId) {
  let items = null;
  // Proviamo prima in italiano, poi con la lingua di default del video.
  try {
    items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'it' });
  } catch {
    try {
      items = await YoutubeTranscript.fetchTranscript(videoId);
    } catch {
      return null;
    }
  }
  if (!items || items.length === 0) return null;

  return items
    .map(it => ({
      start: Math.round((it.offset || 0) / 1000),
      text: (it.text || '').replace(/\s+/g, ' ').trim()
    }))
    .filter(seg => seg.text.length > 0);
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
  });

  console.log(`Video da trascrivere in questa esecuzione: ${toProcess.length}`);

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
      if (segments && segments.length > 0) {
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
    await new Promise(r => setTimeout(r, 250));
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
