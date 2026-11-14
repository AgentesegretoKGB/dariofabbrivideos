// Vercel Serverless Function (Node.js)
// POST /api/search-transcripts
// body: { query, videoIds?, sort? }  — videoIds: se presente, cerca solo in questi video (filtri della pagina);
//        sort: 'list' = risultati nell'ordine di videoIds (la pagina li manda già ordinati per data)
//
// Pubblica (nessuna password). Il token GitHub resta sul server: serve solo a leggere l'indice.
// Variabili d'ambiente: GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH
//
// Risposta: { results: [{ videoId, title, hits: [{ start, text, marks, cutStart, cutEnd }] }], total, truncated }
//  - i risultati sono raggruppati per video;
//  - ogni «hit» è l'intero periodo (da punto a punto) che contiene la frase cercata;
//  - marks = [[inizio, fine], …] posizioni della frase cercata dentro text (da mettere in grassetto);
//  - start = secondo del video in cui inizia il periodo.

const INDEX_PATH = 'transcripts/_all.json';
const MAX_VIDEOS = 40;          // video restituiti al massimo
const MAX_HITS_PER_VIDEO = 12;  // periodi per video al massimo
const MAX_SIDE_CHARS = 200;     // se un periodo non ha punteggiatura per molto, lo tagliamo con «…»
const CACHE_MS = 10 * 60 * 1000;

let cache = null; // { at, docs } — sopravvive tra chiamate della stessa istanza

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Metodo non consentito' });
    return;
  }

  const { query, videoIds, sort } = req.body || {};

  // Gli spazi all'inizio o alla fine contano: «Nato » cerca la parola intera, non «Natoli».
  const raw = String(query || '').replace(/\s+/g, ' ');
  const q = raw.trim();
  if (q.length < 3) {
    res.status(400).json({ message: 'Scrivi almeno 3 caratteri da cercare' });
    return;
  }
  if (q.length > 200) {
    res.status(400).json({ message: 'La frase è troppo lunga (massimo 200 caratteri)' });
    return;
  }

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    res.status(500).json({ message: 'Configurazione server incompleta (GITHUB_REPO/GITHUB_TOKEN)' });
    return;
  }

  try {
    let docs;
    if (cache && Date.now() - cache.at < CACHE_MS) {
      docs = cache.docs;
    } else {
      const url = `https://api.github.com/repos/${repo}/contents/${INDEX_PATH}?ref=${branch}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (resp.status === 404) {
        res.status(200).json({ results: [], total: 0, message: 'Nessuna trascrizione ancora disponibile.' });
        return;
      }
      if (!resp.ok) {
        res.status(502).json({ message: 'Errore leggendo l\'indice trascrizioni: ' + (await resp.text()) });
        return;
      }
      docs = prepareIndex(await resp.json());
      cache = { at: Date.now(), docs };
    }

    // filtri (categoria, formato, argomento, anno): la pagina manda l'elenco dei video ammessi
    let pool = docs;
    if (Array.isArray(videoIds)) {
      const allowed = new Set(videoIds.slice(0, 5000).map(String));
      pool = docs.filter(d => allowed.has(d.videoId));
    }
    res.status(200).json(searchDocs(pool, raw, sort === 'list' && Array.isArray(videoIds) ? videoIds.map(String) : null));
  } catch (err) {
    res.status(500).json({ message: 'Errore interno: ' + String(err) });
  }
}

/**
 * Prepara l'indice: i segmenti di ogni video vengono uniti in un unico testo,
 * così si trovano anche le frasi spezzate tra due segmenti.
 */
export function prepareIndex(index) {
  return index
    .map(video => ({ videoId: video.videoId, title: video.title, ...buildDoc(video.segments || []) }))
    .filter(d => d.text);
}

/** Cerca la frase in tutte le trascrizioni; i video con più occorrenze vengono prima. */
export function searchDocs(docs, query, order = null) {
  const needle = foldText(collapse(query)).text;
  // spazio iniziale/finale = confine di parola: prima/dopo non ci deve essere una lettera o una cifra
  const boundStart = /^\s/.test(query), boundEnd = /\s$/.test(query);
  const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
  let results = [];
  let total = 0;
  let truncated = false;

  for (const doc of docs) {

    const hits = [];
    let from = 0;
    let videoMatches = 0;
    while (true) {
      const pos = doc.folded.indexOf(needle, from);
      if (pos === -1) break;
      if ((boundStart && isWordChar(doc.folded[pos - 1])) || (boundEnd && isWordChar(doc.folded[pos + needle.length]))) {
        from = pos + 1;
        continue;
      }
      from = pos + needle.length;
      videoMatches++;

      // posizioni nel testo originale
      const mStart = doc.map[pos];
      const mEnd = doc.map[pos + needle.length - 1] + 1;

      const last = hits[hits.length - 1];
      if (last && mStart < last._end) {
        // stessa frase: aggiungo solo un altro grassetto
        last.marks.push([mStart - last._start, Math.min(mEnd, last._end) - last._start]);
        continue;
      }
      if (hits.length >= MAX_HITS_PER_VIDEO) { truncated = true; continue; }

      const [sStart, sEnd, cutStart, cutEnd] = sentenceBounds(doc.text, mStart, mEnd, last ? last._end : 0);
      hits.push({
        _start: sStart,
        _end: sEnd,
        start: doc.timeAt(sStart),
        text: doc.text.slice(sStart, sEnd),
        marks: [[mStart - sStart, mEnd - sStart]],
        cutStart,
        cutEnd
      });
    }

    if (!hits.length) continue;
    total += videoMatches;
    results.push({
      videoId: doc.videoId,
      title: doc.title,
      matches: videoMatches,
      hits: hits.map(({ _start, _end, ...h }) => h)
    });
  }

  if (order) {
    // ordine scelto dalla pagina (per data): prima i video che vengono prima nell'elenco
    const rank = new Map(order.map((id, i) => [id, i]));
    results.sort((a, b) => (rank.get(a.videoId) ?? 1e9) - (rank.get(b.videoId) ?? 1e9));
  } else {
    results.sort((a, b) => b.matches - a.matches);
  }
  if (results.length > MAX_VIDEOS) { results = results.slice(0, MAX_VIDEOS); truncated = true; }
  return { results, total, videos: results.length, truncated };
}

/** Testo del video + mappa carattere → tempo + versione senza accenti/maiuscole per cercare. */
function buildDoc(segments) {
  let text = '';
  const starts = []; // [posizione nel testo, secondo]
  for (const seg of segments) {
    const t = collapse(seg.text || '');
    if (!t) continue;
    if (text) text += ' ';
    starts.push([text.length, Math.max(0, Math.floor(Number(seg.start) || 0))]);
    text += t;
  }
  const { text: folded, map } = foldText(text);
  const timeAt = (pos) => {
    let lo = 0, hi = starts.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid][0] <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return starts.length ? starts[ans][1] : 0;
  };
  return { text, folded, map, timeAt };
}

/** Toglie accenti e maiuscole tenendo una mappa da ogni carattere «piegato» alla sua posizione originale. */
function foldText(s) {
  let out = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const f = s[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let k = 0; k < f.length; k++) { out += f[k]; map.push(i); }
  }
  return { text: out, map };
}

function collapse(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

const END = /[.!?…]/;

/**
 * Inizio e fine del periodo (da punto a punto) che contiene [mStart, mEnd).
 * minStart evita che due periodi consecutivi ripetano lo stesso testo.
 */
function sentenceBounds(text, mStart, mEnd, minStart = 0) {
  // indietro fino al segno di fine periodo precedente
  let s = mStart;
  while (s > minStart && !(END.test(text[s - 1]) && (s >= text.length || /\s/.test(text[s])))) s--;
  let cutStart = false;
  if (mStart - s > MAX_SIDE_CHARS) {
    s = mStart - MAX_SIDE_CHARS;
    while (s < mStart && !/\s/.test(text[s - 1] || ' ')) s++; // non spezzare una parola
    cutStart = true;
  } else if (s === minStart && minStart > 0 && !END.test(text[s - 1] || '')) {
    cutStart = true; // il periodo è iniziato nel risultato precedente
  }
  while (s < mStart && /\s/.test(text[s])) s++;

  // avanti fino al segno di fine periodo successivo (compreso, anche «...» o «?!»)
  let e = mEnd;
  while (e < text.length && !END.test(text[e])) e++;
  while (e < text.length && END.test(text[e])) e++;
  let cutEnd = false;
  if (e - mEnd > MAX_SIDE_CHARS) {
    e = mEnd + MAX_SIDE_CHARS;
    while (e > mEnd && !/\s/.test(text[e] || ' ')) e--;
    cutEnd = true;
  }
  // il periodo continua a sinistra/destra oltre il testo mostrato
  return [s, e, cutStart, cutEnd];
}
