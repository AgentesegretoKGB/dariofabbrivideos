// tools/trascrittore/trascrivi.mjs
// Trascrittore per il Mac: genera le trascrizioni dei video che non le hanno e le aggiunge
// all'archivio del sito (transcripts/_all.json), lo stesso file letto da «Cerca nelle trascrizioni».
//
// Per ogni video:
//   1. scarica l'audio da YouTube con yt-dlp (dalla connessione di casa: i server vengono bloccati);
//   2. lo converte con ffmpeg nel formato che serve a Whisper;
//   3. lo trascrive sul Mac con whisper.cpp (modello large-v3-turbo, in italiano);
//   4. aggiunge la trascrizione all'archivio, fa il commit e lo invia a GitHub.
// Ogni video viene inviato appena pronto: se il programma si interrompe, il lavoro fatto resta salvato.
//
// Uso (di solito lo lancia «Trascrivi video» sulla Scrivania):
//   node tools/trascrittore/trascrivi.mjs                 → tutti i video senza trascrizione
//   node tools/trascrittore/trascrivi.mjs <link o id>     → solo quel video (rifà la trascrizione se c'è già)
// Opzioni: --max N (al massimo N video), --no-push (salva solo in locale, per prova)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIDEOS = path.join(REPO, 'src/assets/videos.json');
const INDEX = path.join(REPO, 'transcripts/_all.json');
const MANIFEST = path.join(REPO, 'transcripts/_manifest.json');
const HOME = path.join(os.homedir(), 'Trascrittore');
const MODEL = process.env.TRASCRITTORE_MODELLO || path.join(HOME, 'modelli', 'ggml-large-v3-turbo-q5_0.bin');
const WORK = path.join(HOME, 'lavoro');
// Homebrew installa Whisper come «whisper-cli» (versioni recenti) o «whisper-cpp» (versioni vecchie)
const WHISPER = ['whisper-cli', 'whisper-cpp'].find(c => !spawnSync(c, ['--help'], { stdio: 'ignore' }).error) || 'whisper-cli';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const MAX = Number(opt('--max')) || Infinity;
const PUSH = !flag('--no-push');
const only = args[0] ? videoIdOf(args[0]) : null;

function videoIdOf(s) {
  s = String(s).trim();
  const m = s.match(/(?:embed\/|youtu\.be\/|[?&]v=|shorts\/|live\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{6,20}$/.test(s) ? s : null);
}

function run(cmd, cmdArgs, { cwd = REPO, quiet = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf-8' });
  if (r.error) throw new Error(`Non trovo il programma «${cmd}»: ripeti l'installazione.`);
  if (r.status !== 0 && !allowFail) throw new Error(`«${cmd}» non è riuscito` + (quiet && r.stderr ? `:\n${r.stderr.trim().split('\n').slice(-5).join('\n')}` : ''));
  return r;
}
const git = (...a) => run('git', a, { quiet: true });

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; } }

function hhmmss(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

// Frasi che Whisper a volte «inventa» sui silenzi o sulla musica
const HALLUCINATIONS = /amara\.org|sottotitoli (creati|a cura|e revisione)|iscriviti al canale|grazie per (la visione|l'attenzione)\.?$|^\[(musica|applausi|silenzio)\]$|^\((musica|applausi)\)$/i;

function cleanSegments(raw) {
  const out = [];
  for (const s of raw) {
    const text = String(s.text || '').replace(/\s+/g, ' ').trim();
    if (!text || HALLUCINATIONS.test(text)) continue;
    // Whisper può ripetere la stessa frase in loop: teniamo al massimo due ripetizioni di fila
    const n = out.length;
    if (n >= 2 && out[n - 1].text === text && out[n - 2].text === text) continue;
    out.push({ start: Math.max(0, Math.round(s.start)), text });
  }
  return out;
}

function transcribe(videoId, title) {
  fs.mkdirSync(WORK, { recursive: true });
  const base = path.join(WORK, videoId);
  for (const f of fs.readdirSync(WORK)) if (f.startsWith(videoId)) fs.rmSync(path.join(WORK, f), { force: true });

  console.log('  1/3 Scarico l\'audio da YouTube…');
  const dl = run('yt-dlp', ['-f', 'bestaudio/best', '--no-playlist', '--no-progress', '-o', `${base}.%(ext)s`, `https://www.youtube.com/watch?v=${videoId}`], { quiet: true, allowFail: true });
  const audio = fs.readdirSync(WORK).map(f => path.join(WORK, f)).find(f => path.basename(f).startsWith(videoId + '.') && !f.endsWith('.part'));
  if (dl.status !== 0 || !audio) {
    const why = (dl.stderr || '').split('\n').filter(l => /ERROR/.test(l)).pop() || 'download non riuscito';
    throw new Error('YouTube non ha dato l\'audio: ' + why.replace(/^ERROR:\s*/, ''));
  }

  console.log('  2/3 Preparo l\'audio…');
  const wav = `${base}.wav`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audio, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { quiet: true });
  fs.rmSync(audio, { force: true });

  console.log('  3/3 Trascrivo con Whisper (può volerci qualche minuto)…');
  const threads = String(Math.max(2, Math.min(8, os.cpus().length)));
  run(WHISPER, ['-m', MODEL, '-l', 'it', '-t', threads, '-mc', '64', '-pp', '-oj', '-of', base, '-f', wav], { quiet: false });
  const json = readJson(`${base}.json`, null);
  fs.rmSync(wav, { force: true }); fs.rmSync(`${base}.json`, { force: true });
  if (!json?.transcription?.length) throw new Error('Whisper non ha prodotto testo');

  const segments = cleanSegments(json.transcription.map(t => ({ start: (t.offsets?.from ?? 0) / 1000, text: t.text })));
  if (!segments.length) throw new Error('la trascrizione è vuota');
  return { videoId, title, segments };
}

/** Aggiunge (o sostituisce) una trascrizione nell'archivio e la invia a GitHub. */
function save(entry) {
  if (PUSH) git('pull', '--rebase', '--quiet', 'origin', 'main');
  const index = readJson(INDEX, []);
  const i = index.findIndex(e => e.videoId === entry.videoId);
  if (i >= 0) index[i] = entry; else index.push(entry);
  fs.writeFileSync(INDEX, JSON.stringify(index), 'utf-8');

  const manifest = readJson(MANIFEST, { done: [], failed: [] });
  manifest.done = [...new Set([...(manifest.done || []), entry.videoId])];
  manifest.failed = (manifest.failed || []).filter(id => id !== entry.videoId);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf-8');

  git('add', 'transcripts/_all.json', 'transcripts/_manifest.json');
  git('commit', '--quiet', '-m', `Trascrizione generata: ${entry.title}`.slice(0, 120));
  if (PUSH) {
    for (let tent = 1; ; tent++) {
      const r = run('git', ['push', '--quiet', 'origin', 'HEAD:main'], { quiet: true, allowFail: true });
      if (r.status === 0) break;
      if (tent >= 3) throw new Error('invio a GitHub non riuscito: ' + (r.stderr || '').trim());
      git('pull', '--rebase', '--quiet', 'origin', 'main');
    }
  }
}

function checkTools() {
  for (const [cmd, a] of [['yt-dlp', ['--version']], ['ffmpeg', ['-version']], [WHISPER, ['--help']], ['git', ['--version']]]) {
    const r = spawnSync(cmd, a, { stdio: 'ignore' });
    if (r.error) { console.error(`Manca «${cmd}». Ripeti l'installazione (vedi LEGGIMI.md).`); process.exit(1); }
  }
  if (!fs.existsSync(MODEL)) { console.error(`Manca il modello di Whisper in ${MODEL}. Ripeti l'installazione.`); process.exit(1); }
}

async function main() {
  checkTools();
  if (PUSH) git('pull', '--rebase', '--quiet', 'origin', 'main');

  const videos = readJson(VIDEOS, []);
  const have = new Set(readJson(INDEX, []).map(e => e.videoId));
  let todo;
  if (only) {
    const v = videos.find(x => videoIdOf(x.url) === only);
    todo = [{ id: only, title: v?.title || only }];
    if (!v) console.log(`Attenzione: il video ${only} non è nel catalogo; lo trascrivo lo stesso.`);
    if (have.has(only)) console.log('Questo video ha già una trascrizione: la rifaccio e la sostituisco.');
  } else {
    todo = videos.map(v => ({ id: videoIdOf(v.url), title: v.title })).filter(v => v.id && !have.has(v.id));
  }
  todo = todo.slice(0, MAX);
  if (!todo.length) { console.log('Tutti i video del catalogo hanno già la trascrizione. Niente da fare!'); return; }

  console.log(`\nVideo da trascrivere: ${todo.length}\n`);
  const ok = [], ko = [];
  for (const [n, v] of todo.entries()) {
    console.log(`[${n + 1}/${todo.length}] ${v.title}`);
    const t0 = Date.now();
    try {
      const entry = transcribe(v.id, v.title);
      save(entry);
      const last = entry.segments[entry.segments.length - 1];
      console.log(`  ✓ Fatto: ${entry.segments.length} frasi, durata ${hhmmss(last.start)}, in ${Math.round((Date.now() - t0) / 60000)} min` + (PUSH ? ' — già online nella ricerca' : ' (solo in locale)') + '\n');
      ok.push(v);
    } catch (e) {
      console.log(`  ✗ Saltato: ${e.message}\n`);
      ko.push({ ...v, why: e.message });
    }
  }

  console.log('────────────────────────────────────────');
  console.log(`Trascrizioni aggiunte: ${ok.length}${ko.length ? ` — non riuscite: ${ko.length}` : ''}`);
  for (const v of ko) console.log(`  • ${v.title}\n    https://youtu.be/${v.id} — ${v.why}`);
  if (ko.length) console.log('Quelli non riusciti verranno riprovati la prossima volta che lanci il programma.');
}

main().catch(e => { console.error('\nErrore: ' + e.message); process.exit(1); });
