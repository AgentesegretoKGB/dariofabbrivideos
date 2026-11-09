import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MinigameService, Phrase, fold } from '../minigames/minigame.service';

interface Row { p: Phrase; text: string; points: number; variants: string; active: boolean; open: boolean; saving: boolean; msg: string; error: boolean; }

const MIN = 1, MAX = 50;
const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Math.round(Number(n) || MIN)));
const variantsText = (p: Phrase) => (p.variants || []).filter(v => fold(v) !== fold(p.text)).join(', ');

/** Mini interfaccia per modificare l'elenco delle formule e i loro punti. */
@Component({
  selector: 'app-phrase-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './phrase-editor.component.html',
  styleUrls: ['./phrase-editor.component.css']
})
export class PhraseEditorComponent implements OnInit {
  private mg = inject(MinigameService);
  rows = signal<Row[]>([]);
  loaded = signal(false);
  error = signal('');
  q = signal('');
  sort = signal<'text' | 'points-desc' | 'points-asc'>('text');
  show = signal<'all' | 'active' | 'off'>('all');
  savingAll = signal(false);
  topMsg = signal('');
  tick = signal(0);   // forza il ricalcolo dopo modifiche dentro le righe

  nf = { text: '', points: 3, variants: '' };
  adding = signal(false);
  addMsg = signal('');

  readonly visible = computed(() => {
    this.tick();
    const q = fold(this.q()).trim(), show = this.show(), s = this.sort();
    let list = this.rows().filter(r => show === 'all' || (show === 'active' ? r.p.active : !r.p.active));
    if (q) list = list.filter(r => fold(r.text).includes(q) || fold(r.variants).includes(q));
    return [...list].sort((a, b) => s === 'text' ? a.text.localeCompare(b.text, 'it') : s === 'points-desc' ? b.points - a.points || a.text.localeCompare(b.text, 'it') : a.points - b.points || a.text.localeCompare(b.text, 'it'));
  });
  readonly dirtyCount = computed(() => { this.tick(); return this.rows().filter(r => this.dirty(r)).length; });
  readonly stats = computed(() => { this.tick(); const a = this.rows().filter(r => r.p.active); return { active: a.length, off: this.rows().length - a.length }; });

  async ngOnInit() { await this.load(); }

  async load() {
    try {
      const list = await this.mg.phrases(true);
      const old = new Map(this.rows().map(r => [r.p.id, r]));
      this.rows.set(list.map(p => ({ p, text: p.text, points: p.points, variants: variantsText(p), active: p.active, open: old.get(p.id)?.open ?? false, saving: false, msg: '', error: false })));
    } catch (e: any) { this.error.set(e.message); }
    this.loaded.set(true);
  }

  dirty(r: Row) { return r.text.trim() !== r.p.text || clamp(r.points) !== r.p.points || r.variants.trim() !== variantsText(r.p) || r.active !== r.p.active; }
  changed() { this.tick.update(n => n + 1); }

  step(r: Row, d: number) { r.points = clamp(r.points + d); this.changed(); }
  setPoints(r: Row, v: any) { r.points = clamp(v); this.changed(); }

  private parseVariants(s: string) { return s.split(',').map(v => v.trim()).filter(Boolean); }

  async save(r: Row) {
    if (!r.text.trim()) { r.msg = 'Il testo non può essere vuoto.'; r.error = true; this.changed(); return; }
    r.saving = true; r.msg = ''; this.changed();
    try {
      await this.mg.savePhrase({ id: r.p.id, text: r.text, points: clamp(r.points), variants: this.parseVariants(r.variants), active: r.active });
      r.p = { ...r.p, text: r.text.trim(), points: clamp(r.points), variants: this.parseVariants(r.variants).map(v => v.toLowerCase()), active: r.active };
      r.points = r.p.points; r.text = r.p.text; r.variants = variantsText(r.p);
      r.msg = 'Salvata'; r.error = false;
      setTimeout(() => { if (r.msg === 'Salvata') { r.msg = ''; this.changed(); } }, 2000);
    } catch (e: any) { r.msg = e.message; r.error = true; }
    r.saving = false; this.changed();
  }

  undo(r: Row) { r.text = r.p.text; r.points = r.p.points; r.variants = variantsText(r.p); r.active = r.p.active; r.msg = ''; this.changed(); }

  async toggleActive(r: Row) { r.active = !r.active; this.changed(); await this.save(r); }

  async saveAll() {
    this.savingAll.set(true); this.topMsg.set('');
    const list = this.rows().filter(r => this.dirty(r));
    for (const r of list) await this.save(r);
    const failed = list.filter(r => r.error).length;
    this.topMsg.set(failed ? `${failed} modifiche non salvate: guarda i messaggi in rosso.` : `${list.length} formule salvate.`);
    this.savingAll.set(false);
  }

  async remove(r: Row) {
    if (!confirm(`Eliminare definitivamente "${r.p.text}"?\n\nSe è già stata scelta in qualche schedina, conviene invece disattivarla: resta nei risultati passati ma non si può più scegliere.`)) return;
    try { await this.mg.deletePhrase(r.p.id); this.rows.update(l => l.filter(x => x !== r)); }
    catch (e: any) { r.msg = e.message; r.error = true; this.changed(); }
  }

  async add() {
    if (!this.nf.text.trim()) { this.addMsg.set('Scrivi la formula.'); return; }
    this.adding.set(true); this.addMsg.set('');
    try {
      await this.mg.savePhrase({ text: this.nf.text, points: clamp(this.nf.points), variants: this.parseVariants(this.nf.variants) });
      this.addMsg.set(`"${this.nf.text.trim()}" aggiunta.`);
      this.nf = { text: '', points: 3, variants: '' };
      await this.load();
    } catch (e: any) { this.addMsg.set(e.message); }
    this.adding.set(false);
  }

  addStep(d: number) { this.nf.points = clamp(this.nf.points + d); }
}
