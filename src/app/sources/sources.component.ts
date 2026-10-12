import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sources',
  templateUrl: './sources.component.html',
  styleUrls: ['./sources.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class SourcesComponent {
  sources = [
    { name: 'Fonte 1', link: '#' },
    { name: 'Fonte 2', link: '#' },
  ];
}
