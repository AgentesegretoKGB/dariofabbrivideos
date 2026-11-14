import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { CalEvent, linkHref } from './calendar.service';

const SITE = 'https://www.catalogovideodariofabbri.it';
const FOOT = 30;     // striscia bianca in fondo (px)
const LILAC: [number, number, number] = [138, 132, 176];
const PT = 0.75;     // 1 px = 0,75 pt

/**
 * Scarica un PDF identico alla card del sito: la card viene fotografata così com'è
 * (senza il pulsante PDF) e il link resta cliccabile nello stesso punto.
 */
export async function downloadEventPdf(e: CalEvent, card: HTMLElement, color: string) {
  const r = card.getBoundingClientRect();
  const cw = Math.floor(r.width), chPx = Math.floor(r.height);   // misure intere: niente righe sul bordo
  let linkBox: { x: number; y: number; w: number; h: number } | null = null;
  const canvas = await html2canvas(card, {
    scale: 3, width: cw, height: chPx, backgroundColor: color, useCORS: true, logging: false,
    onclone: (doc, el) => {
      el.style.boxShadow = 'none'; el.style.borderRadius = '0';
      el.querySelector<HTMLElement>('.cal-tile__foot')?.style.setProperty('display', 'none');
      // nel PDF il link è una riga come le altre, sotto tutte le informazioni: icona + testo sottolineato
      const a = el.querySelector<HTMLElement>('.cal-tile__link'), info = el.querySelector<HTMLElement>('.cal-tile__info');
      if (a && info) {
        const row = doc.createElement('p');
        row.style.cssText = 'margin: 0; display: flex; align-items: flex-start; gap: 7px;';
        const svg = a.querySelector('svg');   // html2canvas rinomina <app-icon>: prendiamo direttamente il disegno
        if (svg) { svg.style.flex = 'none'; svg.style.marginTop = '2px'; row.appendChild(svg); }
        const span = doc.createElement('span');
        span.textContent = (a.textContent || '').replace('↗', '').trim();
        span.style.cssText = 'text-decoration: underline; text-underline-offset: 2px; font-weight: 600;';
        row.appendChild(span); info.appendChild(row);
        const c = el.getBoundingClientRect(), s = span.getBoundingClientRect();
        linkBox = { x: s.left - c.left, y: s.top - c.top, w: s.width, h: s.height };
      }
    }
  });

  // tutta la pagina del colore della card, con una striscia bianca in fondo
  const W = cw * PT, CH = chPx * PT, H = (chPx + FOOT) * PT;
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
  doc.setProperties({ title: e.title, creator: SITE });
  const hex = color.replace('#', '');
  doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  doc.rect(0, 0, W, CH, 'F');
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, W, CH);
  doc.setFillColor(255, 255, 255); doc.rect(0, CH, W, H - CH, 'F');

  // link dell'evento cliccabile sopra la sua immagine
  const lb = linkBox as { x: number; y: number; w: number; h: number } | null;
  if (lb && e.link) doc.link(lb.x * PT, lb.y * PT, lb.w * PT, lb.h * PT, { url: linkHref(e.link) });

  // striscia in fondo: «PDF scaricato da catalogovideodariofabbri» con il nome sottolineato e cliccabile
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...LILAC); doc.setDrawColor(...LILAC); doc.setLineWidth(0.6);
  const lead = 'PDF scaricato da ', name = 'catalogovideodariofabbri';
  const lw = doc.getTextWidth(lead), nw = doc.getTextWidth(name);
  const x = (W - lw - nw) / 2, y = CH + (H - CH) / 2 + 3;
  doc.text(lead, x, y);
  doc.text(name, x + lw, y);
  doc.line(x + lw, y + 1.6, x + lw + nw, y + 1.6);
  doc.link(x + lw, CH, nw, H - CH, { url: SITE });

  const slug = e.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  doc.save(`evento-${e.day}-${slug || 'calendario'}.pdf`);
}
