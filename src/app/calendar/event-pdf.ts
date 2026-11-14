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
  const canvas = await html2canvas(card, {
    scale: 3, width: cw, height: chPx, backgroundColor: color, useCORS: true, logging: false,
    onclone: (_doc, el) => {
      el.style.boxShadow = 'none'; el.style.borderRadius = '0';
      el.querySelector<HTMLElement>('.cal-tile__dl')?.style.setProperty('display', 'none');
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
  const a = card.querySelector<HTMLElement>('.cal-tile__link');
  if (a && e.link) {
    const l = a.getBoundingClientRect();
    doc.link((l.left - r.left) * PT, (l.top - r.top) * PT, l.width * PT, l.height * PT, { url: linkHref(e.link) });
  }

  // striscia in fondo: link al sito, scritto in breve
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...LILAC);
  const label = 'PDF scaricato da Campacavallo';
  const tw = doc.getTextWidth(label), x = (W - tw) / 2, y = CH + (H - CH) / 2 + 3;
  doc.text(label, x, y);
  doc.link(x, CH, tw, H - CH, { url: SITE });

  const slug = e.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  doc.save(`evento-${e.day}-${slug || 'calendario'}.pdf`);
}
