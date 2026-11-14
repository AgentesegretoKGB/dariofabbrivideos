import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { IconComponent } from '../shared/icon.component';
import { CalEvent, CalendarService, hhmm, isoDay, linkHost, linkHref, parseDay } from './calendar.service';

interface MonthGroup { key: string; label: string; events: CalEvent[]; }

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const WEEKDAY = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const LONG = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/** Colori dei riquadri, tenui come nell'esempio; si alternano evento dopo evento. */
const TILE_COLORS = ['#b2abd2', '#e2687f', '#ccb59c', '#a08a3c', '#d6bcc9', '#e2523e', '#cf9fc8', '#9fb3b8', '#d9a35f', '#a9b48f'];

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, IconComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
  private cal = inject(CalendarService);
  @ViewChild('reportDlg') reportDlg?: ElementRef<HTMLDialogElement>;

  readonly today = isoDay(new Date());
  events = signal<CalEvent[]>([]);
  loading = signal(true);
  error = signal('');
  showPast = signal(false);
  pdfBusy = signal<string | null>(null);

  // segnalazione
  rf = { title: '', day: '', time: '', place: '', description: '', link: '', email: '' };
  sending = signal(false);
  sent = signal(false);
  reportError = signal('');

  private group(list: CalEvent[]): MonthGroup[] {
    const map = new Map<string, MonthGroup>();
    for (const e of list) {
      const d = parseDay(e.day), key = e.day.slice(0, 7);
      if (!map.has(key)) map.set(key, { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, events: [] });
      map.get(key)!.events.push(e);
    }
    return [...map.values()];
  }
  readonly upcoming = computed(() => this.group(this.events().filter(e => e.day >= this.today)));
  readonly past = computed(() => this.group(this.events().filter(e => e.day < this.today).reverse()));
  readonly pastCount = computed(() => this.events().filter(e => e.day < this.today).length);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true); this.error.set('');
    const n = new Date();
    const from = isoDay(new Date(n.getFullYear() - 1, n.getMonth(), 1));
    const to = isoDay(new Date(n.getFullYear() + 2, n.getMonth(), 1));
    try { this.events.set((await this.cal.events(from, to)).sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || ''))); }
    catch (e: any) { this.error.set(e.message); this.events.set([]); }
    this.loading.set(false);
  }

  /** Colore del riquadro: stabile per ogni evento. */
  color(e: CalEvent): string {
    let h = 0;
    for (const c of (e.id || e.title)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return TILE_COLORS[h % TILE_COLORS.length];
  }
  dayNum(e: CalEvent) { return parseDay(e.day).getDate(); }
  weekday(e: CalEvent) { return WEEKDAY.format(parseDay(e.day)).replace('.', ''); }
  long(day: string) { return LONG.format(parseDay(day)); }
  isToday(e: CalEvent) { return e.day === this.today; }

  /** Descrizione sulla card: al massimo 200 caratteri. */
  short(s: string) { const t = s.trim(); return t.length > 200 ? t.slice(0, 199).trimEnd() + '…' : t; }

  async downloadPdf(e: CalEvent) {
    this.pdfBusy.set(e.id ?? e.title);
    try { (await import('./event-pdf')).downloadEventPdf(e, this.long(e.day)); }
    finally { this.pdfBusy.set(null); }
  }

  openReport() { this.sent.set(false); this.reportError.set(''); this.reportDlg?.nativeElement.showModal(); }

  async sendReport() {
    this.sending.set(true); this.reportError.set('');
    try {
      await this.cal.report(this.rf);
      this.sent.set(true);
      this.rf = { title: '', day: '', time: '', place: '', description: '', link: '', email: '' };
    } catch (e: any) { this.reportError.set(e.message); }
    this.sending.set(false);
  }

  backdropClose(ev: MouseEvent, d: HTMLDialogElement) { if (ev.target === d) d.close(); }

  readonly hhmm = hhmm;
  readonly href = linkHref;
  readonly host = linkHost;
}
