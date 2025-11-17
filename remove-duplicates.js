const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/assets/videos.json', 'utf8'));
const seen = new Map();
const unique = [];

data.forEach((v, index) => {
  const key = v.url.toLowerCase().trim();
  if (!seen.has(key)) {
    seen.set(key, true);
    unique.push(v);
  } else {
    console.log(`Rimosso duplicato ID ${v.id}: ${v.title}`);
  }
});

console.log(`\nVideo originali: ${data.length}`);
console.log(`Video unici: ${unique.length}`);
console.log(`Duplicati rimossi: ${data.length - unique.length}`);

// Rinumera gli ID
unique.forEach((v, index) => {
  v.id = index + 1;
});

// Salva il file aggiornato
fs.writeFileSync('src/assets/videos.json', JSON.stringify(unique, null, 2), 'utf8');
console.log('\nFile aggiornato con successo!');
