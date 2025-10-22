import { Routes } from '@angular/router';
import { CatalogComponent } from './catalog/catalog.component';
import { SourcesComponent } from './sources/sources.component';
import { MaterialsComponent } from './materials/materials.component';

export const routes: Routes = [
  { path: '', component: CatalogComponent },
  { path: 'sources', component: SourcesComponent },
  { path: 'materials', component: MaterialsComponent },
];
