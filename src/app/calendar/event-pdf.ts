import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { CalEvent, linkHref } from './calendar.service';

const SITE = 'https://www.catalogovideodariofabbri.it';
const PAD = 24;      // margine intorno alla card (px)
const FOOT = 44;     // spazio per la scritta in fondo (px)
const PT = 0.75;     // 1 px = 0,75 pt

/**
 * Scarica un PDF identico alla card del sito: la card viene fotografata così com'è
 * (senza il pulsante PDF) e il link resta cliccabile nello stesso punto.
 */
export async function downloadEventPdf(e: CalEvent, card: HTMLElement) {
  const r = card.getBoundingClientRect();
  const canvas = await html2canvas(card, {
    scale: 3, backgroundColor: null, useCORS: true, logging: false,
    onclone: (_doc, el) => {
      el.style.boxShadow = 'none';
      el.querySelector<HTMLElement>('.cal-tile__dl')?.style.setProperty('display', 'none');
    }
  });

  const W = (r.width + 2 * PAD) * PT, H = (r.height + 2 * PAD + FOOT) * PT;
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
  doc.setProperties({ title: e.title, creator: SITE });
  doc.setFillColor(253, 252, 249); doc.rect(0, 0, W, H, 'F');
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', PAD * PT, PAD * PT, r.width * PT, r.height * PT);

  // link dell'evento cliccabile sopra la sua immagine
  const a = card.querySelector<HTMLElement>('.cal-tile__link');
  if (a && e.link) {
    const l = a.getBoundingClientRect();
    doc.link((PAD + l.left - r.left) * PT, (PAD + l.top - r.top) * PT, l.width * PT, l.height * PT, { url: linkHref(e.link) });
  }

  // piè di pagina
  const fy = (PAD + r.height + FOOT / 2 + 8) * PT;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 106, 140);
  const lead = 'PDF scaricato da ', site = SITE.replace('https://', '');
  const x = (W - doc.getTextWidth(lead + site)) / 2;
  doc.text(lead, x, fy);
  doc.setTextColor(226, 82, 62);
  doc.textWithLink(site, x + doc.getTextWidth(lead), fy, { url: SITE });

  const slug = e.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  doc.save(`evento-${e.day}-${slug || 'calendario'}.pdf`);
}
