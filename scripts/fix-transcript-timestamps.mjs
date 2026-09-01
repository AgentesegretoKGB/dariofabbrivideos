// scripts/fix-transcript-timestamps.mjs
// Corregge una volta sola i timestamp già salvati in transcripts/_all.json,
// che erano stati salvati per errore in millisecondi invece che in secondi.
// Non richiede di ri-scaricare nulla da YouTube.

import fs from 'node:fs';
import path from 'node:path';

const INDEX_PATH = path.resolve('transcripts/_all.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

let fixedSegments = 0;
for (const video of index) {
  for (const seg of video.segments || []) {
    seg.start = Math.round(seg.start / 1000);
    fixedSegments++;
  }
}

fs.writeFileSync(INDEX_PATH, JSON.stringify(index), 'utf-8');
console.log(`Corretti ${fixedSegments} segmenti in ${index.length} video.`);
