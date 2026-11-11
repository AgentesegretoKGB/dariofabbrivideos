import { Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

/** Icone a tratto (24×24, colore del testo). Uso: <app-icon name="mappe" /> */
const ICONS: { [name: string]: string } = {
  // sezioni
  catalogo: '<rect x="3" y="5" width="4" height="15" rx="1"/><rect x="8.5" y="3" width="4" height="17" rx="1"/><path d="M14.6 6.2l3.8-1.2 3.4 14.4-3.8 1.2z"/><path d="M2 21h20"/>',
  trascrizioni: '<circle cx="15" cy="6.5" r="3.6"/><path d="M17.6 9.1L20.5 12"/><path d="M3 4h7M3 8h6M3 13h18M3 17h18M3 21h12"/>',
  mappe: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  minigiochi: '<path d="M5 21h14a1 1 0 0 0 1-1v-1.5a3.5 3.5 0 0 0-3.5-3.5h-9A3.5 3.5 0 0 0 4 18.5V20a1 1 0 0 0 1 1z"/><path d="M12 15V8.6"/><circle cx="12" cy="5.6" r="3"/><circle cx="16.6" cy="18.2" r="1" fill="currentColor"/>',
  fonti: '<path d="M12 8.5V3.5"/><path d="M12 3.5c-2.6 0-4.6 2-4.9 4.5M12 3.5c2.6 0 4.6 2 4.9 4.5"/><path d="M6.5 9.5h11c-.6 2-2.7 3.2-5.5 3.2s-4.9-1.2-5.5-3.2z"/><path d="M12 12.7v3.3"/><path d="M2.5 16h19c-.6 3-3.6 5-9.5 5s-8.9-2-9.5-5z"/>',
  materiali: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v2h5v-2c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M10.5 12.5l1.5-2 1.5 2"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
  // dettagli eventi e moduli
  titolo: '<path d="M4 6h16M4 12h10M4 18h7"/>',
  luogo: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>',
  data: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  orario: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  descrizione: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6l8.5 7 8.5-7"/>',
  piu: '<path d="M12 5v14M5 12h14"/>',
  sinistra: '<path d="M15 5l-7 7 7 7"/>',
  destra: '<path d="M9 5l7 7-7 7"/>',
  chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
  modifica: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  cestino: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  spunta: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" fill="none" stroke="currentColor" [attr.stroke-width]="stroke()"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" [innerHTML]="svg()"></svg>`,
  styles: [`:host { display: inline-flex; flex: none; line-height: 0; } svg { display: block; }`]
})
export class IconComponent {
  private san = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly stroke = input<number>(1.8);
  readonly svg = computed<SafeHtml>(() => this.san.bypassSecurityTrustHtml(ICONS[this.name()] || ''));
}
