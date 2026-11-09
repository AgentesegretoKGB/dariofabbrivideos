import { Component } from '@angular/core';

interface SavedMap {
  title: string;
  file: string;    // progetto .json in public/atlante/mappe
  preview: string; // anteprima in public/atlante/anteprime
}

const EDITOR = '/atlante/editor.html';

@Component({
  selector: 'app-maps',
  standalone: true,
  templateUrl: './maps.component.html',
  styleUrls: ['./maps.component.css']
})
export class MapsComponent {
  readonly editorUrl = EDITOR;

  // Per aggiungere una mappa: metti il .json in public/atlante/mappe e l'anteprima in public/atlante/anteprime
  readonly maps: SavedMap[] = [
    { title: "L'Italia e la sua energia", file: 'italia-energia.json', preview: 'italia-energia.jpg' },
    { title: 'Mediterraneo', file: 'mediterraneo.json', preview: 'mediterraneo.jpg' },
  ];

  openUrl(m: SavedMap): string {
    return `${EDITOR}?mappa=${encodeURIComponent('/atlante/mappe/' + m.file)}`;
  }

  previewUrl(m: SavedMap): string {
    return '/atlante/anteprime/' + m.preview;
  }
}
