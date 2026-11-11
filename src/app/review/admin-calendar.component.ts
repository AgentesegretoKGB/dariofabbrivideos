import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MinigameService } from '../minigames/minigame.service';
import { IconComponent } from '../shared/icon.component';
import { CalEvent, CalReport, CalendarService, hhmm, isoDay, linkHost, linkHref, parseDay } from '../calendar/calendar.service';

const LONG = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const empty = (): CalEvent => ({ title: '', place: '', day: '', time: '', description: '', link: '' });

/** Revisione del calendario: eventi pubblici e segnalazioni del pubblico. Solo amministratori. */
@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './admin-calendar.component.html',
  styleUrls: ['./admin-calendar.component.css']
})
export class AdminCalendarComponent implements OnInit {
  readonly auth = inject(AuthService);
  private cal = inject(CalendarService);
  private mg = inject(MinigameService);

  checking = signal(true);
  admin = signal(false);
  error = signal('');
  section = signal<'eventi' | 'segnalazioni'>('eventi');
  events = signal<CalEvent[]>([]);
  reports = signal<CalReport[]>([]);
  form: CalEvent = empty();
  fromReport: CalReport | null = null;
  saving = signal(false);
  msg = signal('');
  msgError = signal(false);
  showPast = signal(false);

  readonly today = isoDay(new Date());
  readonly upcoming = computed(() => this.events().filter(e => e.day >= this.today).sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || '')));
  readonly past = computed(() => this.events().filter(e => e.day < this.today));
  readonly newReports = computed(() => this.reports().filter(r => r.status === 'new'));
  readonly oldReports = computed(() => this.reports().filter(r => r.status !== 'new'));

  async ngOnInit() {
    try {
      await new Promise<void>(r => { const t = setInterval(() => { if (this.auth.ready()) { clearInterval(t); r(); } }, 50); });
      this.admin.set(await this.mg.isAdmin());
      if (this.admin()) await this.reload();
    } catch (e: any) { this.error.set(e.message); }
    this.checking.set(false);
  }

  async reload() {
    try {
      const [ev, rp] = await Promise.all([this.cal.allEvents(), this.cal.reports()]);
      this.events.set(ev); this.reports.set(rp);
    } catch (e: any) { this.error.set(e.message); }
  }

  private say(m: string, err = false) { this.msg.set(m); this.msgError.set(err); }

  async save() {
    if (!this.form.title.trim() || !this.form.day) { this.say('Nome e data sono obbligatori.', true); return; }
    this.saving.set(true); this.say('');
    try {
      const editing = !!this.form.id;
      await this.cal.saveEvent(this.form);
      if (this.fromReport) await this.cal.setReportStatus(this.fromReport.id!, 'approved');
      this.say(this.fromReport ? 'Segnalazione pubblicata nel calendario.' : editing ? 'Evento aggiornato.' : 'Evento aggiunto al calendario.');
      this.form = empty(); this.fromReport = null;
      await this.reload();
    } catch (e: any) { this.say(e.message, true); }
    this.saving.set(false);
  }

  edit(e: CalEvent) {
    this.form = { ...e, time: hhmm(e.time), place: e.place || '', description: e.description || '', link: e.link || '' };
    this.fromReport = null; this.section.set('eventi'); this.say('');
    setTimeout(() => document.querySelector('.acal-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  cancelEdit() { this.form = empty(); this.fromReport = null; this.say(''); }

  async remove(e: CalEvent) {
    if (!confirm(`Eliminare "${e.title}" dal calendario?`)) return;
    try { await this.cal.deleteEvent(e.id!); await this.reload(); this.say('Evento eliminato.'); }
    catch (err: any) { this.say(err.message, true); }
  }

  /** Copia la segnalazione nel modulo per controllarla prima di pubblicarla. */
  review(r: CalReport) {
    this.form = { title: r.title, place: r.place || '', day: r.day, time: hhmm(r.time), description: r.description || '', link: r.link || '' };
    this.fromReport = r; this.section.set('eventi'); this.say('Controlla i dati e premi «Pubblica».');
    setTimeout(() => document.querySelector('.acal-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  async reject(r: CalReport) {
    try { await this.cal.setReportStatus(r.id!, 'rejected'); await this.reload(); } catch (e: any) { this.say(e.message, true); }
  }

  async removeReport(r: CalReport) {
    if (!confirm('Eliminare questa segnalazione?')) return;
    try { await this.cal.deleteReport(r.id!); await this.reload(); } catch (e: any) { this.say(e.message, true); }
  }

  readonly hhmm = hhmm;
  readonly href = linkHref;
  readonly host = linkHost;
  day(d: string) { return LONG.format(parseDay(d)); }
  sentAt(iso: string) { return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
}
