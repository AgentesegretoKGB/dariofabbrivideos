import { Injectable, inject } from '@angular/core';
import { AuthService, SUPABASE_URL } from '../auth/auth.service';

export interface MapItem {
  id: string;            // slug per le mappe del sito, uuid per quelle pubblicate dagli utenti
  title: string;
  preview: string;       // indirizzo dell'anteprima
  file: string;          // indirizzo del progetto .json
  author?: string | null;
  userId?: string;       // chi l'ha pubblicata (solo mappe degli utenti)
  createdAt?: string;
  paths?: { file: string; preview: string };
}

export const EDITOR_URL = '/atlante/editor.html';

/** Mappe preparate per il sito: .json in public/atlante/mappe, anteprima in public/atlante/anteprime. */
export const BUILTIN_MAPS: MapItem[] = [
  { id: 'italia-energia', title: "L'Italia e la sua energia", file: '/atlante/mappe/italia-energia.json', preview: '/atlante/anteprime/italia-energia.jpg' },
  { id: 'mediterraneo', title: 'Mediterraneo', file: '/atlante/mappe/mediterraneo.json', preview: '/atlante/anteprime/mediterraneo.jpg' },
];

export const storageUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/mappe/${path}`;

export function editorLink(m: MapItem): string {
  return `${EDITOR_URL}?mappa=${encodeURIComponent(m.file)}`;
}

@Injectable({ providedIn: 'root' })
export class MapsService {
  private auth = inject(AuthService);

  private toItem(r: any): MapItem {
    return {
      id: r.id, title: r.title, author: r.profiles?.username ?? null, userId: r.user_id, createdAt: r.created_at,
      file: storageUrl(r.file_path), preview: storageUrl(r.preview_path), paths: { file: r.file_path, preview: r.preview_path },
    };
  }

  /** Mappe pubblicate dagli utenti, dalla più recente. Lista vuota se la tabella non esiste ancora. */
  async published(): Promise<MapItem[]> {
    const c = await this.auth.client();
    const { data, error } = await c.from('maps').select('id,title,file_path,preview_path,created_at,user_id,profiles(username)')
      .order('created_at', { ascending: false }).limit(300);
    if (error) return [];
    return (data || []).map(r => this.toItem(r));
  }

  async find(id: string): Promise<MapItem | null> {
    const b = BUILTIN_MAPS.find(m => m.id === id);
    if (b) return b;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const c = await this.auth.client();
    const { data } = await c.from('maps').select('id,title,file_path,preview_path,created_at,user_id,profiles(username)').eq('id', id).maybeSingle();
    return data ? this.toItem(data) : null;
  }

  async remove(m: MapItem): Promise<string | null> {
    const c = await this.auth.client();
    const { error } = await c.from('maps').delete().eq('id', m.id);
    if (error) return 'Mappa non cancellata: ' + error.message;
    if (m.paths) await c.storage.from('mappe').remove([m.paths.file, m.paths.preview]);
    return null;
  }
}
