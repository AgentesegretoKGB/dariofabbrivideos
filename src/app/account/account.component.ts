import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Provider } from '@supabase/supabase-js';
import { AuthService, PROVIDERS } from '../auth/auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css']
})
export class AccountComponent implements OnInit {
  readonly auth = inject(AuthService);
  providers = signal<typeof PROVIDERS>([]);
  emailEnabled = signal(true);
  loaded = signal(false);

  email = '';
  busy = signal(false);
  message = signal('');
  error = signal('');

  async ngOnInit() {
    // Errore restituito da Google & co. nell'indirizzo di ritorno
    const p = new URLSearchParams(window.location.search + '&' + window.location.hash.slice(1));
    const err = p.get('error_description');
    if (err) this.error.set('Accesso non riuscito: ' + err.replace(/\+/g, ' '));

    const s = await this.auth.enabledProviders();
    this.providers.set(s.providers);
    this.emailEnabled.set(s.email);
    this.loaded.set(true);
  }

  async signInWith(id: Provider) {
    this.error.set('');
    const { error } = await this.auth.signInWith(id);
    if (error) this.error.set('Accesso non riuscito: ' + error.message);
  }

  async sendLink() {
    const email = this.email.trim();
    if (!email) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    const { error } = await this.auth.sendEmailLink(email);
    this.busy.set(false);
    if (error) this.error.set(/rate limit/i.test(error.message)
      ? 'Troppe email inviate in poco tempo: riprova tra qualche minuto.'
      : 'Invio non riuscito: ' + error.message);
    else this.message.set(`Ti abbiamo mandato un link a ${email}. Aprilo da questo dispositivo per entrare.`);
  }

  async signOut() {
    await this.auth.signOut();
    this.message.set(''); this.error.set('');
  }
}
