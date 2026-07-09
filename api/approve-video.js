// Vercel Serverless Function (Node.js)
// POST /api/approve-video
// body: { password, action: 'approve' | 'reject', video: {...} }
//
// Variabili d'ambiente richieste (da impostare su Vercel > Settings > Environment Variables):
// - REVIEW_PASSWORD      es. R3visione
// - GITHUB_TOKEN         Personal Access Token con permesso "Contents: Read and write" sul repo
// - GITHUB_REPO          es. AgentesegretoKGB/dariofabbrivideos
// - GITHUB_BRANCH        es. main
// - VIDEOS_FILE_PATH     es. src/assets/videos.json

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
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    res.status(500).json({ message: 'Configurazione server incompleta (GITHUB_REPO/GITHUB_TOKEN)' });
    return;
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${branch}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  try {
    // 1. Leggi il file attuale
    const getResp = await fetch(apiUrl, { headers });
    if (!getResp.ok) {
      const text = await getResp.text();
      res.status(502).json({ message: 'Errore leggendo il file da GitHub: ' + text });
      return;
    }
    const getJson = await getResp.json();
    const sha = getJson.sha;
    const currentContent = Buffer.from(getJson.content, 'base64').toString('utf-8');
    const videosArray = JSON.parse(currentContent);

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
      const cleanVideo = {
        id: video.id,
        title: video.title,
        url: video.url,
        date: video.date,
        tags: {
          format: video.tags?.format || [],
          argomento: video.tags?.argomento || [],
          categoria: video.tags?.categoria || []
        }
      };
      videosArray[idx] = cleanVideo; // niente più "pending": è stato revisionato
      commitMessage = `Revisione: approvato video #${video.id}`;
    }

    const newContent = JSON.stringify(videosArray, null, 2);
    const newContentBase64 = Buffer.from(newContent, 'utf-8').toString('base64');

    const putResp = await fetch(apiUrl.split('?')[0], {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMessage,
        content: newContentBase64,
        sha,
        branch
      })
    });

    if (!putResp.ok) {
      const text = await putResp.text();
      res.status(502).json({ message: 'Errore scrivendo su GitHub: ' + text });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Errore interno: ' + String(err) });
  }
}
