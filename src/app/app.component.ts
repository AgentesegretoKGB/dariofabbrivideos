import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';  // per router-outlet
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [RouterModule, CommonModule]  // permette <router-outlet>, routerLink e *ngIf
})
export class AppComponent {
  title = 'fabbri-videos';
  drawerOpen = false;

  toggleDrawer(){
    this.drawerOpen = !this.drawerOpen;
  }
}
