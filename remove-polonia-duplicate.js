const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/assets/videos.json', 'utf8'));

// Trova l'indice del video con id 86 (duplicato di Polonia vs UE)
const duplicateIndex = data.findIndex(v => v.id === 86 && v.title === "Polonia vs UE. Perché?");

if (duplicateIndex !== -1) {
  console.log(`Trovato duplicato all'indice ${duplicateIndex}:`);
  console.log(`ID: ${data[duplicateIndex].id}, Titolo: ${data[duplicateIndex].title}`);
  
  // Rimuovi il duplicato
  data.splice(duplicateIndex, 1);
  console.log(`\nDuplicato rimosso!`);
}

// Rinumera tutti gli ID a partire da 1
data.forEach((v, index) => {
  v.id = index + 1;
});

console.log(`\nVideo totali dopo rimozione: ${data.length}`);
console.log(`Primo ID: ${data[0].id}, Ultimo ID: ${data[data.length-1].id}`);

// Salva il file aggiornato
fs.writeFileSync('src/assets/videos.json', JSON.stringify(data, null, 2), 'utf8');
console.log('\nFile aggiornato con successo!');
