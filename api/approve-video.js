// Vercel Serverless Function (Node.js)
// POST /api/approve-video
// body: { password, action: 'approve' | 'reject', video: {...} }
//
// Variabili d'ambiente richieste (Vercel > Settings > Environment Variables):
// - REVIEW_PASSWORD          es. R3visione
// - GITHUB_TOKEN             Personal Access Token con permesso "Contents: Read and write"
// - GITHUB_REPO              es. AgentesegretoKGB/dariofabbrivideos
// - GITHUB_BRANCH            es. main
// - VIDEOS_FILE_PATH         es. src/assets/videos.json
// - REJECTED_IDS_FILE_PATH   es. src/assets/rejected-ids.json

function extractVideoId(url) {
  if (!url) return null;
  const m =
    url.match(/embed\/([^?&/]+)/i) ||
    url.match(/youtu\.be\/([^?&/]+)/i) ||
    url.match(/[?&]v=([^?&/]+)/i);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Metodo non consentito' });
    return;
  }

  const { password, action, video } = req.body || {};

  if (!password || password !== process.env.REVIEW_PASSWORD) {
    res.status(401).json({ message: 'Password errata' });
    return;
  }

  if (!video || typeof video.id !== 'number') {
    res.status(400).json({ message: 'Video non valido' });
    return;
  }

  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ message: 'Azione non valida' });
    return;
  }

  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const filePath = process.env.VIDEOS_FILE_PATH || 'src/assets/videos.json';
  const rejectedIdsPath = process.env.REJECTED_IDS_FILE_PATH || 'src/assets/rejected-ids.json';
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    res.status(500).json({ message: 'Configurazione server incompleta (GITHUB_REPO/GITHUB_TOKEN)' });
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  async function getFile(path) {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Errore leggendo ${path}: ` + (await resp.text()));
    const json = await resp.json();
    return { sha: json.sha, content: Buffer.from(json.content, 'base64').toString('utf-8') };
  }

  async function putFile(path, content, sha, message) {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        sha,
        branch
      })
    });
    if (!resp.ok) throw new Error(`Errore scrivendo ${path}: ` + (await resp.text()));
  }

  try {
    // 1. Leggi e aggiorna videos.json
    const { sha, content } = await getFile(filePath);
    const videosArray = JSON.parse(content);

    const idx = videosArray.findIndex(v => v.id === video.id);
    if (idx === -1) {
      res.status(404).json({ message: 'Video non trovato nel catalogo (forse già revisionato da un\'altra sessione)' });
      return;
    }

    let commitMessage;
    if (action === 'reject') {
      videosArray.splice(idx, 1);
      commitMessage = `Revisione: rimosso video #${video.id}`;
    } else {
      videosArray[idx] = {
        id: video.id,
        title: video.title,
        url: video.url,
        date: video.date,
        tags: {
          format: video.tags?.format || [],
          argomento: video.tags?.argomento || [],
          categoria: video.tags?.categoria || []
        }
      }; // niente più "pending": è stato revisionato
      commitMessage = `Revisione: approvato video #${video.id}`;
    }

    await putFile(filePath, JSON.stringify(videosArray, null, 2) + '\n', sha, commitMessage);

    // 2. Se è un rifiuto, salva l'ID YouTube nella lista nera per non riproporlo mai più
    if (action === 'reject') {
      const videoId = extractVideoId(video.url);
      if (videoId) {
        try {
          const rejected = await getFile(rejectedIdsPath);
          const rejectedIds = JSON.parse(rejected.content);
          if (!rejectedIds.includes(videoId)) {
            rejectedIds.push(videoId);
            await putFile(
              rejectedIdsPath,
              JSON.stringify(rejectedIds, null, 2) + '\n',
              rejected.sha,
              `Lista nera: aggiunto ${videoId} (video #${video.id} rifiutato)`
            );
          }
        } catch (blacklistErr) {
          // Non blocchiamo la rimozione del video se la lista nera fallisce:
          // logghiamo solo, il video resta comunque rimosso dal catalogo.
          console.error('Errore aggiornando la lista nera:', blacklistErr);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Errore interno: ' + String(err) });
  }
}
