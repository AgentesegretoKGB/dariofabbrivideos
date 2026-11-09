// Completa il nome del canale YouTube ("channel") per i video di src/assets/videos.json che non ce l'hanno.
// Chiede a YouTube i dati di 50 video per volta (videos.list, 1 unità di quota per richiesta).
// Richiede: process.env.YOUTUBE_API_KEY
import fs from 'node:fs';

const VIDEOS_PATH = 'src/assets/videos.json';
const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('Manca YOUTUBE_API_KEY');
  process.exit(1);
}

function videoIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/embed\/([^?&/]+)/i) || url.match(/youtu\.be\/([^?&/]+)/i) || url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

async function channelsFor(ids) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('maxResults', '50');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Errore YouTube videos.list: ' + (await resp.text()));
  const json = await resp.json();
  const out = new Map();
  for (const it of json.items || []) out.set(it.id, it.snippet?.channelTitle || '');
  return out;
}

async function main() {
  const videos = JSON.parse(fs.readFileSync(VIDEOS_PATH, 'utf-8'));
  const missing = videos.filter(v => !v.channel && videoIdFromUrl(v.url));
  if (!missing.length) {
    console.log('Tutti i video hanno già il nome del canale.');
    return;
  }

  let filled = 0;
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const found = await channelsFor(batch.map(v => videoIdFromUrl(v.url)));
    for (const v of batch) {
      const name = found.get(videoIdFromUrl(v.url));
      if (name) { v.channel = name; filled++; }
    }
  }

  fs.writeFileSync(VIDEOS_PATH, JSON.stringify(videos, null, 2) + '\n', 'utf-8');
  console.log(`Nome del canale aggiunto a ${filled} video su ${missing.length} senza canale.`);
  const notFound = missing.length - filled;
  if (notFound) console.log(`${notFound} video non trovati su YouTube (rimossi o privati): restano senza canale.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
