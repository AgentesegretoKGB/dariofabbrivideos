/**
 * Parole di «Riprendiamoci Fiume!»: l'inglese da tradurre e le risposte accettate
 * (la prima è quella mostrata come correzione). Per aggiungere parole basta aggiungere righe.
 */
export interface FiumeWord { en: string; it: string[]; }

export const FIUME_WORDS: FiumeWord[] = [
  { en: 'Task force', it: ['Gruppo speciale'] },
  { en: 'Spoiler', it: ['Anticipazione'] },
  { en: 'Strategy', it: ['Tattica'] },
  { en: 'Globalization', it: ['Dominio americano degli stretti'] },
  { en: 'Top', it: ['Meraviglia', 'Fantastico'] },
];

export const SECONDS_PER_WORD = 10;

/**
 * Identificativo del «turno»: cambia da solo quando cambia l'elenco delle parole.
 * In classifica conta solo la prima partita di ogni turno.
 */
export const FIUME_ROUND = 'r' + (() => {
  let h = 5381;
  for (const c of JSON.stringify(FIUME_WORDS)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(36);
})();
