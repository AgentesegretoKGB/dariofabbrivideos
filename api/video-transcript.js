// Vercel Serverless Function (Node.js)
// GET /api/video-transcript?id=<id YouTube>
//
// Restituisce la trascrizione di un video, usata dalla revisione dei minigiochi per
// assegnare i punti in automatico. Prima cerca nell'indice transcripts/_all.json del
// repository (come la ricerca nelle trascrizioni); se il video non c'è (per esempio è
// ancora in revisione) prova a scaricare i sottotitoli da YouTube al momento.
// Variabili d'ambiente: GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH
//
// Risposta: { videoId, source: 'indice' | 'youtube', segments: [{ start, text }] }

import { YoutubeTranscript } from 'youtube-transcript';

const INDEX_PATH = 'transcripts/_all.json';
const CACHE_MS = 10 * 60 * 1000;
let cache = null; // { at, byId } — sopravvive tra chiamate della stessa istanza

async function loadIndex() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byId;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return new Map();
  const resp = await fetch(`https://api.github.com/repos/${repo}/contents/${INDEX_PATH}?ref=${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!resp.ok) return new Map();
  const index = await resp.json();
  const byId = new Map((index || []).map(v => [v.videoId, v.segments || []]));
  cache = { at: Date.now(), byId };
  return byId;
}

async function fromYoutube(videoId) {
  let items = null;
  try { items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'it' }); }
  catch { try { items = await YoutubeTranscript.fetchTranscript(videoId); } catch { return null; } }
  if (!items || !items.length) return null;
  return items
    .map(it => ({ start: Math.round((it.offset || 0) / 1000), text: String(it.text || '').replace(/\s+/g, ' ').trim() }))
    .filter(s => s.text);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ message: 'Metodo non consentito' }); return; }
  const id = String(req.query?.id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) { res.status(400).json({ message: 'Id del video non valido' }); return; }

  try {
    const byId = await loadIndex();
    if (byId.has(id)) { res.status(200).json({ videoId: id, source: 'indice', segments: byId.get(id) }); return; }
    const segments = await fromYoutube(id);
    if (segments) { res.status(200).json({ videoId: id, source: 'youtube', segments }); return; }
    res.status(404).json({ message: 'Trascrizione non disponibile per questo video: puoi incollarla a mano.' });
  } catch (err) {
    res.status(500).json({ message: 'Errore interno: ' + String(err) });
  }
}
