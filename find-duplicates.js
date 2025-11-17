const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/assets/videos.json', 'utf8'));
const seen = new Map();
const duplicates = [];

data.forEach((v, index) => {
  const key = v.url.toLowerCase().trim();
  if (seen.has(key)) {
    duplicates.push({
      id1: seen.get(key).id,
      id2: v.id,
      index1: seen.get(key).index,
      index2: index,
      title1: seen.get(key).title,
      title2: v.title,
      url: v.url
    });
  } else {
    seen.set(key, {id: v.id, index: index, title: v.title});
  }
});

console.log('Duplicati trovati:', duplicates.length);
duplicates.forEach(d => {
  console.log(`\nID ${d.id1} (pos ${d.index1}): ${d.title1}`);
  console.log(`ID ${d.id2} (pos ${d.index2}): ${d.title2}`);
  console.log(`URL: ${d.url}`);
});
