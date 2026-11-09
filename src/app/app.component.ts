import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth/auth.service';

const TITLES: { [path: string]: string } = {
  '': 'Catalogo',
  'sources': 'Fonti',
  'materials': 'Materiali utili',
  'revisione': 'Revisione',
  'trascrizioni': 'Cerca nelle trascrizioni',
  'mappe': 'Mappe',
};

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [RouterModule, CommonModule]
})
export class AppComponent {
  drawerOpen = false;
  pageTitle = 'Catalogo';
  onAccount = false;

  get topTitle(): string {
    return this.onAccount ? (this.auth.user() ? 'Il tuo account' : 'Accedi') : this.pageTitle;
  }
  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;

  constructor(router: Router, public auth: AuthService) {
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0].replace(/^\//, '').split('/')[0];
      try { sessionStorage.removeItem('reloaded-for'); } catch { }
      this.onAccount = path === 'account';
      this.pageTitle = TITLES[path] ?? 'Catalogo';
    });
  }

  openDrawer() {
    this.drawerOpen = true;
    setTimeout(() => this.closeBtn?.nativeElement.focus());
  }

  closeDrawer() {
    this.drawerOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.drawerOpen) this.closeDrawer();
  }
}
