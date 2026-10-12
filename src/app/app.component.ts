import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

const TITLES: { [path: string]: string } = {
  '': 'Catalogo',
  'sources': 'Fonti',
  'materials': 'Materiali utili',
  'revisione': 'Revisione',
  'trascrizioni': 'Trascrizioni',
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
  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;

  constructor(router: Router) {
    router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      const path = (e as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0].replace(/^\//, '').split('/')[0];
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
