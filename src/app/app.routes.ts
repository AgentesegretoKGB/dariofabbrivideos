import { Routes } from '@angular/router';
import { CatalogComponent } from './catalog/catalog.component';
import { SourcesComponent } from './sources/sources.component';
import { MaterialsComponent } from './materials/materials.component';

export const routes: Routes = [
  { path: '', component: CatalogComponent },
  { path: 'sources', component: SourcesComponent },
  { path: 'materials', component: MaterialsComponent },
  {
    path: 'revisione',
    loadComponent: () => import('./review/review.component').then(m => m.ReviewComponent)
  },
  {
    path: 'trascrizioni',
    loadComponent: () => import('./transcripts/transcripts.component').then(m => m.TranscriptsComponent)
  },
  { path: '**', redirectTo: '' },
];
