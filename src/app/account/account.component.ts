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

  // ----- username -----
  editingUsername = signal(false);
  usernameDraft = '';
  usernameHint = signal('');
  usernameOk = signal(false);
  usernameError = signal('');
  savingUsername = signal(false);
  private checkTimer: any;

  startEditUsername() {
    this.usernameDraft = this.auth.username() ?? '';
    this.usernameHint.set(''); this.usernameError.set(''); this.usernameOk.set(false);
    this.editingUsername.set(true);
  }

  cancelEditUsername() { this.editingUsername.set(false); }

  onUsernameInput() {
    clearTimeout(this.checkTimer);
    this.usernameError.set(''); this.usernameOk.set(false);
    const name = this.auth.normalizeUsername(this.usernameDraft);
    if (!name) { this.usernameHint.set(''); return; }
    if (!AuthService.USERNAME_RE.test(name)) {
      this.usernameHint.set('Da 3 a 20 caratteri: lettere, numeri, punto o trattino basso.');
      return;
    }
    if (name === this.auth.username()) { this.usernameHint.set('È il tuo username attuale.'); return; }
    this.usernameHint.set('Controllo…');
    this.checkTimer = setTimeout(async () => {
      try {
        const free = await this.auth.isUsernameFree(name);
        if (this.auth.normalizeUsername(this.usernameDraft) !== name) return;
        this.usernameOk.set(free);
        this.usernameHint.set(free ? `@${name} è disponibile` : `@${name} è già preso`);
      } catch { this.usernameHint.set(''); }
    }, 400);
  }

  async saveUsername() {
    this.savingUsername.set(true); this.usernameError.set('');
    const err = await this.auth.saveUsername(this.usernameDraft);
    this.savingUsername.set(false);
    if (err) { this.usernameError.set(err); return; }
    this.editingUsername.set(false);
    this.message.set('Username salvato.');
  }

  async signOut() {
    await this.auth.signOut();
    this.editingUsername.set(false);
    this.message.set(''); this.error.set('');
  }
}
