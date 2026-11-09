import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app/app.routes';

/**
 * Dopo un nuovo aggiornamento del sito i file delle sezioni cambiano nome: chi aveva la pagina
 * già aperta non riuscirebbe più ad aprire una sezione. In quel caso ricarichiamo la pagina
 * (una volta sola, per non entrare in un ciclo) così arriva la versione nuova.
 */
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'|ChunkLoadError/i;

function reloadOnStaleChunk(err: unknown, url: string) {
  const msg = String((err as any)?.message ?? err);
  if (!STALE_CHUNK.test(msg)) return;
  try {
    if (sessionStorage.getItem('reloaded-for') === url) return;
    sessionStorage.setItem('reloaded-for', url);
  } catch { /* senza sessionStorage ricarichiamo comunque */ }
  window.location.assign(url);
}

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes, withNavigationErrorHandler(e => reloadOnStaleChunk(e.error, e.url)))]
})
.catch(err => console.error(err));
