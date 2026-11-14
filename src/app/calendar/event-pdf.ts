import { jsPDF } from 'jspdf';
import { CalEvent, hhmm, linkHref } from './calendar.service';

const SITE = 'https://www.catalogovideodariofabbri.it';
const RED: [number, number, number] = [226, 82, 62];
const INK: [number, number, number] = [26, 21, 20];
const MUTED: [number, number, number] = [110, 106, 140];

/** Le lettere fuori dal Latin-1 (virgolette curve, trattini lunghi…) non esistono nei font base del PDF. */
function clean(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '');
}

/** Crea e scarica il PDF di un evento, con il link cliccabile. */
export function downloadEventPdf(e: CalEvent, longDate: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 20, CW = W - 2 * M;
  doc.setProperties({ title: clean(e.title), creator: SITE });

  // fascia rossa in alto
  doc.setFillColor(...RED); doc.rect(0, 0, W, 14, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('CALENDARIO  ·  CAMPACAVALLO', M, 9);

  let y = 32;
  doc.setTextColor(...RED); doc.setFontSize(13);
  const date = longDate.charAt(0).toUpperCase() + longDate.slice(1);
  doc.text(clean(date + (e.time ? `  ·  ore ${hhmm(e.time)}` : '')).toUpperCase(), M, y);

  y += 12;
  doc.setTextColor(...INK); doc.setFontSize(26);
  const title = doc.splitTextToSize(clean(e.title), CW);
  doc.text(title, M, y, { lineHeightFactor: 1.15 });
  y += title.length * 26 * 0.3528 * 1.15 + 8;

  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(clean(value), CW);
    doc.text(lines, M, y, { lineHeightFactor: 1.35 });
    y += lines.length * 13 * 0.3528 * 1.35 + 7;
  };
  if (e.place) row('Luogo', e.place);
  if (e.description) row('Descrizione', e.description);

  if (e.link) {
    const url = linkHref(e.link);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text('LINK DELL\'EVENTO', M, y); y += 4;
    // pulsante cliccabile
    doc.setFillColor(...RED); doc.roundedRect(M, y, 70, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(12);
    doc.text('Apri la pagina dell\'evento', M + 35, y + 7.8, { align: 'center' });
    doc.link(M, y, 70, 12, { url });
    y += 19;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...RED);
    const shown = doc.splitTextToSize(clean(url), CW);
    doc.text(shown, M, y);
    doc.link(M, y - 4, CW, shown.length * 5 + 1, { url });
  }

  // piè di pagina
  const fy = 297 - 14;
  doc.setDrawColor(231, 227, 218); doc.line(M, fy - 7, W - M, fy - 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  const lead = 'PDF scaricato da ';
  doc.text(lead, M, fy);
  const lx = M + doc.getTextWidth(lead);
  doc.setTextColor(...RED);
  doc.textWithLink(SITE.replace('https://', ''), lx, fy, { url: SITE });

  const slug = clean(e.title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  doc.save(`evento-${e.day}-${slug || 'calendario'}.pdf`);
}
