import { AfterViewInit, Component, ElementRef, HostListener, NgZone, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth/auth.service';
import { IconComponent } from './shared/icon.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [RouterModule, CommonModule, IconComponent]
})
export class AppComponent implements AfterViewInit {
  @ViewChild('rail') rail?: ElementRef<HTMLElement>;
  /** Menu laterale aperto (con i nomi accanto alle icone). */
  railOpen = false;
  /** Tipo dell'ultimo puntatore: col dito il primo tocco apre il menu invece di navigare. */
  lastPointer = 'mouse';

  get accountLabel(): string {
    const u = this.auth.user();
    if (!u) return 'Accedi';
    return this.auth.username() ? '@' + this.auth.username() : 'Il tuo account';
  }

  constructor(router: Router, public auth: AuthService, private zone: NgZone) {
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      try { sessionStorage.removeItem('reloaded-for'); } catch { }
      this.railOpen = false;
    });
  }

  private pointerFocus = false;
  onPointerDown(ev: PointerEvent) {
    this.lastPointer = ev.pointerType;
    this.pointerFocus = true;                 // la messa a fuoco che segue viene dal tocco/clic, non dalla tastiera
    setTimeout(() => this.pointerFocus = false, 600);
  }
  /** Con la tastiera (Tab) il menu si apre; con tocco o clic decide onItem/onEnter. */
  onFocusIn() { if (!this.pointerFocus) this.railOpen = true; }

  /** Al passaggio si apre solo col mouse (col dito decide il primo tocco). */
  onEnter(ev: PointerEvent) { if (ev.pointerType === 'mouse') { this.lastPointer = 'mouse'; this.railOpen = true; } }
  onLeave(ev: PointerEvent) { if (ev.pointerType === 'mouse') this.railOpen = false; }
  onFocusOut(ev: FocusEvent) {
    const next = ev.relatedTarget as HTMLElement | null;
    if (!next || !next.closest('.app-rail')) this.railOpen = false;
  }

  /**
   * Col dito il primo tocco su una voce apre il menu con i nomi invece di navigare.
   * Il clic viene fermato mentre attraversa il menu (fase di cattura), prima che arrivi al routerLink.
   */
  ngAfterViewInit() {
    this.rail?.nativeElement.addEventListener('click', (ev: MouseEvent) => {
      if (this.railOpen || this.lastPointer === 'mouse') return;
      if (!(ev.target as HTMLElement).closest('a')) return;
      ev.preventDefault(); ev.stopPropagation();
      this.zone.run(() => this.railOpen = true);
    }, true);
  }

  /** Dopo aver scelto una voce il menu si chiude. */
  afterItem() { this.railOpen = false; }

  closeRail() { this.railOpen = false; }

  @HostListener('document:keydown.escape')
  onEscape() { this.railOpen = false; }
}
