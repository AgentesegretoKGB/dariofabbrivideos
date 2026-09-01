// Vercel Serverless Function (Node.js)
// POST /api/search-transcripts
// body: { password, query }
//
// Riusa le stesse variabili d'ambiente già configurate per /api/approve-video:
// REVIEW_PASSWORD, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH

const INDEX_PATH = 'transcripts/_all.json';
const MAX_RESULTS = 40;
const SNIPPET_CONTEXT_CHARS = 80; // quanti caratteri prima/dopo la frase trovata mostrare

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Metodo non consentito' });
    return;
  }

  const { password, query } = req.body || {};

  if (!password || password !== process.env.REVIEW_PASSWORD) {
    res.status(401).json({ message: 'Password errata' });
    return;
  }

  const q = (query || '').trim();
  if (q.length < 3) {
    res.status(400).json({ message: 'Scrivi almeno 3 caratteri da cercare' });
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
    const url = `https://api.github.com/repos/${repo}/contents/${INDEX_PATH}?ref=${branch}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (resp.status === 404) {
      res.status(200).json({ results: [], message: 'Nessuna trascrizione ancora disponibile.' });
      return;
    }
    if (!resp.ok) {
      res.status(502).json({ message: 'Errore leggendo l\'indice trascrizioni: ' + (await resp.text()) });
      return;
    }

    const index = await resp.json();
    const qNorm = normalize(q);

    const results = [];
    for (const video of index) {
      for (const seg of video.segments || []) {
        const segNorm = normalize(seg.text);
        const pos = segNorm.indexOf(qNorm);
        if (pos === -1) continue;

        const start = Math.max(0, pos - SNIPPET_CONTEXT_CHARS);
        const end = Math.min(seg.text.length, pos + qNorm.length + SNIPPET_CONTEXT_CHARS);
        const snippet = (start > 0 ? '…' : '') + seg.text.slice(start, end) + (end < seg.text.length ? '…' : '');

        results.push({
          videoId: video.videoId,
          title: video.title,
          timestampSeconds: seg.start,
          snippet
        });

        if (results.length >= MAX_RESULTS) break;
      }
      if (results.length >= MAX_RESULTS) break;
    }

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ message: 'Errore interno: ' + String(err) });
  }
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
