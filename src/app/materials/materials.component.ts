import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeUrlPipe } from '../catalog/safe-url.pipe';

interface Material {
  id: number;
  title: string;
  description?: string;
  url?: string;
  type: 'pdf' | 'video' | 'link' | 'document';
  author?: string;
  date?: string;
  embed?: string;
  poster?: string;
  category?: 'analisi' | 'teoria' | 'storico' | 'attualità' | 'ricerca';
  tags?: string[];
  featured?: boolean;
}

@Component({
  selector: 'app-materials',
  standalone: true,
  imports: [CommonModule, FormsModule, SafeUrlPipe],
  templateUrl: './materials.component.html',
  styleUrls: ['./materials.component.css']
})
export class MaterialsComponent implements OnInit, OnDestroy {
  @ViewChild('featuredScroller') featuredScroller!: ElementRef;
  
  private autoScrollInterval: any;
  private scrollDirection = 1; // 1 per destra, -1 per sinistra
  materials: Material[] = [
    { 
      id: 1,
      title: 'Marx - Critica all\'ideologia', 
      description: '',
      url: 'assets/Marx_Critica all\'ideologia.pdf', 
      type: 'pdf', 
      author: 'Karl Marx', 
      date: '2025-10-22',
      category: 'teoria',
      tags: [],
      poster: 'assets/pdf-placeholder.svg',
      featured: true
    },
    { 
      id: 2,
      title: 'JD Vance, "ordo amoris"',
      description: 'Esempio esplicativo dell\'ideologia elettorato Trump',
      url: 'https://www.youtube.com/embed/o98Po0lWZxE?rel=0', 
      type: 'video', 
      author: 'Fox News', 
      date: '2025-1-30',
      embed: 'https://www.youtube.com/embed/o98Po0lWZxE?autoplay=1&rel=0',
      category: 'attualità',
      tags: ['USA'],
      poster: 'https://img.youtube.com/vi/o98Po0lWZxE/hqdefault.jpg',
      featured: true
    },
 { 
      id: 3,
      title: 'Trasimaco - Sulla Giustizia', 
      description: 'Analisi filosofica del concetto di giustizia nel pensiero di Trasimaco',
      url: 'assets/Trasimaco giustizia.pdf', 
      type: 'pdf', 
      author: 'Trasimaco', 
      date: '2024-10-20',
      category: 'teoria',
      tags: ['filosofia', 'giustizia', 'platone', 'sofisti'],
      poster: 'assets/pdf-placeholder.svg',
      featured: true
    },
     { 
      id: 4,
      title: 'Leone sul piano di pace di Trump',
      description: '',
      url: 'https://www.youtube.com/embed/ng6Chg_uwqs?rel=0', 
      type: 'video', 
      author: 'Vatican News', 
      date: '2025-9-30',
      embed: 'https://www.youtube.com/embed/ng6Chg_uwqs?autoplay=1&rel=0',
      category: 'attualità',
      tags: ['Vaticano','Gaza','Guerra in Ucraina'],
      poster: 'https://img.youtube.com/vi/ng6Chg_uwqs/hqdefault.jpg',
      featured: true
    },
  ];

  // Materiali in evidenza - i più recenti e importanti
  get featuredMaterials() {
    return this.materials
      .filter(m => m.featured)
      .sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime())
      .slice(0, 6);
  }

  searchQuery = '';
  selectedCategory = '';
  
    // ordering
  sortBy: 'newest' | 'oldest' | '' = 'newest';
  
  get availableCategories() {
    const categories = new Set(this.materials.map(m => m.category).filter(Boolean));
    return Array.from(categories);
  }

  filteredMaterials() {
    let filtered = this.materials;
    
    // Filtra per categoria
    if (this.selectedCategory) {
      filtered = filtered.filter(m => m.category === this.selectedCategory);
    }
    
    // Filtra per query di ricerca
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(m => {
        const searchText = [
          m.title,
          m.description,
          m.author,
          ...(m.tags || [])
        ].join(' ').toLowerCase();
        return searchText.includes(q);
      });
    }
    
    return filtered.sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
  }

  playingId: number | null = null;

  playVideo(material: Material) {
    if (material.type === 'video' && material.embed) {
      this.playingId = material.id;
    }
  }

  stopVideo() {
    this.playingId = null;
  }

  openMaterial(material: Material) {
    if (material.url) {
      window.open(material.url, '_blank');
    }
  }

  private extractYoutubeThumbnail(url?: string): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    // common forms: https://www.youtube.com/watch?v=ID, https://youtu.be/ID, https://www.youtube.com/embed/ID
    // remove query params
    try {
      const u = url.trim();
      // try embed/ID
      let m = u.match(/embed\/([^?&/]+)/i);
      if (!m) m = u.match(/youtu\.be\/([^?&/]+)/i);
      if (!m) m = u.match(/[?&]v=([^?&/]+)/i);
      const id = m ? m[1] : null;
      if (!id) return undefined;
      return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    } catch (e) {
      return undefined;
    }
  }

  private processVideoMaterials() {
    // Processa tutti i video per aggiornare automaticamente poster e embed URL
    this.materials = this.materials.map(material => {
      if (material.type === 'video' && material.url) {
        const thumbnail = this.extractYoutubeThumbnail(material.url);
        if (thumbnail && (!material.poster || material.poster.includes('placeholder'))) {
          material.poster = thumbnail;
        }
        
        // Assicura che l'embed abbia autoplay se non è già presente
        if (material.embed && !material.embed.includes('autoplay=1')) {
          const separator = material.embed.includes('?') ? '&' : '?';
          material.embed = material.embed + separator + 'autoplay=1';
        }
      }
      return material;
    });
  }

  // Metodo di utilità per aggiungere facilmente nuovi video
  private createVideoMaterial(id: number, title: string, videoUrl: string, author: string, date: string, category: 'analisi' | 'teoria' | 'storico' | 'attualità' | 'ricerca', tags: string[] = [], description: string = '', featured: boolean = false): Material {
    const thumbnail = this.extractYoutubeThumbnail(videoUrl);
    const embedUrl = videoUrl.includes('?') ? videoUrl + '&autoplay=1' : videoUrl + '?autoplay=1';
    
    return {
      id,
      title,
      description,
      url: videoUrl,
      type: 'video',
      author,
      date,
      embed: embedUrl,
      category,
      tags,
      poster: thumbnail || 'assets/video-placeholder.svg',
      featured
    };
  }

  ngOnInit() {
    // Processa automaticamente i video per generare anteprime e autoplay
    this.processVideoMaterials();
    
    // Avvia lo scorrimento automatico dopo 3 secondi
    setTimeout(() => {
      this.startAutoScroll();
    }, 3000);
  }

  ngOnDestroy() {
    this.stopAutoScroll();
  }

  private startAutoScroll() {
    this.autoScrollInterval = setInterval(() => {
      if (this.featuredScroller?.nativeElement) {
        const container = this.featuredScroller.nativeElement;
        const scrollAmount = 200; // pixel da scorrere
        const maxScroll = container.scrollWidth - container.clientWidth;
        
        if (this.scrollDirection === 1) {
          // Scorri verso destra
          if (container.scrollLeft >= maxScroll - 10) {
            this.scrollDirection = -1; // Cambia direzione
          } else {
            container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
          }
        } else {
          // Scorri verso sinistra
          if (container.scrollLeft <= 10) {
            this.scrollDirection = 1; // Cambia direzione
          } else {
            container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
          }
        }
      }
    }, 3000); // Scorre ogni 3 secondi
  }

  private stopAutoScroll() {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
    }
  }

  onMouseEnter() {
    this.stopAutoScroll();
  }

  onMouseLeave() {
    this.startAutoScroll();
  }
}
