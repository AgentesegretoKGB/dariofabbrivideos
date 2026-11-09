import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StarsSummaryComponent } from '../feedback/stars-summary.component';
import { BUILTIN_MAPS, EDITOR_URL, MapItem, MapsService } from './maps.service';

@Component({
  selector: 'app-maps',
  standalone: true,
  imports: [RouterLink, StarsSummaryComponent],
  templateUrl: './maps.component.html',
  styleUrls: ['./maps.component.css']
})
export class MapsComponent implements OnInit {
  private svc = inject(MapsService);
  readonly editorUrl = EDITOR_URL;
  readonly maps = signal<MapItem[]>(BUILTIN_MAPS);

  async ngOnInit() {
    const pub = await this.svc.published();
    if (pub.length) this.maps.set([...pub, ...BUILTIN_MAPS]);
  }
}
