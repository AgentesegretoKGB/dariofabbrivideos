import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { CalEvent, CalendarService, hhmm, isoDay, linkHost, linkHref, parseDay } from './calendar.service';

interface Cell { day: string; date: Date; inMonth: boolean; today: boolean; events: CalEvent[]; }

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const LONG = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css']
})
export class CalendarComponent implements OnInit {
  private cal = inject(CalendarService);
  @ViewChild('detailDlg') detailDlg?: ElementRef<HTMLDialogElement>;
  @ViewChild('reportDlg') reportDlg?: ElementRef<HTMLDialogElement>;

  readonly weekdays = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  readonly today = isoDay(new Date());
  month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  selected = signal(this.today);
  events = signal<CalEvent[]>([]);
  loading = signal(true);
  error = signal('');
  detail = signal<CalEvent | null>(null);

  // segnalazione
  rf = { title: '', day: '', time: '', place: '', description: '', link: '', email: '' };
  sending = signal(false);
  sent = signal(false);
  reportError = signal('');

  readonly monthName = computed(() => MONTHS[this.month().getMonth()]);
  readonly year = computed(() => this.month().getFullYear());

  /** 6 settimane da lunedì, come il Calendario di Apple. */
  readonly cells = computed<Cell[]>(() => {
    const m = this.month();
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;            // lunedì = 0
    const start = new Date(first); start.setDate(1 - offset);
    const byDay = new Map<string, CalEvent[]>();
    for (const e of this.events()) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)!).push(e);
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const day = isoDay(d);
      out.push({ day, date: d, inMonth: d.getMonth() === m.getMonth(), today: day === this.today, events: byDay.get(day) || [] });
    }
    return out;
  });
  readonly selectedEvents = computed(() => this.events().filter(e => e.day === this.selected()));
  readonly selectedLabel = computed(() => LONG.format(parseDay(this.selected())));
  readonly upcoming = computed(() => this.events().filter(e => e.day >= this.today).slice(0, 5));

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true); this.error.set('');
    const m = this.month();
    const from = isoDay(new Date(m.getFullYear(), m.getMonth(), -6));
    const to = isoDay(new Date(m.getFullYear(), m.getMonth() + 1, 13));
    try { this.events.set((await this.cal.events(from, to)).sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || ''))); }
    catch (e: any) { this.error.set(e.message); this.events.set([]); }
    this.loading.set(false);
  }

  move(delta: number) {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
    this.load();
  }

  goToday() {
    const n = new Date();
    this.month.set(new Date(n.getFullYear(), n.getMonth(), 1));
    this.selected.set(this.today);
    this.load();
  }

  pick(c: Cell) {
    this.selected.set(c.day);
    if (!c.inMonth) { this.month.set(new Date(c.date.getFullYear(), c.date.getMonth(), 1)); this.load(); }
  }

  open(e: CalEvent, ev?: Event) {
    ev?.stopPropagation();
    this.detail.set(e);
    setTimeout(() => this.detailDlg?.nativeElement.showModal());
  }

  openReport() {
    this.sent.set(false); this.reportError.set('');
    if (!this.rf.day) this.rf.day = this.selected();
    this.reportDlg?.nativeElement.showModal();
  }

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
  long(day: string) { return LONG.format(parseDay(day)); }
  dayNum(c: Cell) { return c.date.getDate(); }
}
