import { Injectable, NgZone, signal } from '@angular/core';
import type { Provider, Session, SupabaseClient, User } from '@supabase/supabase-js';

// Dati pubblici del progetto Supabase (non sono segreti: la chiave "publishable" va nel browser)
const SUPABASE_URL = 'https://ykqoyozoinehdnltthrz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tYIEJVVcxF926h-xeTqOLA_NiPOP5xU';

/** Servizi di accesso che il sito sa mostrare, nell'ordine in cui compaiono. */
export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'azure', label: 'Microsoft' },
  { id: 'github', label: 'GitHub' },
  { id: 'twitter', label: 'X' },
  { id: 'discord', label: 'Discord' },
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly ready = signal(false);
  /** La libreria di Supabase si scarica dopo la pagina, per non rallentare il primo caricamento. */
  private readonly clientPromise: Promise<SupabaseClient>;

  constructor(private zone: NgZone) {
    this.clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      client.auth.getSession().then(({ data }) => this.setSession(data.session));
      client.auth.onAuthStateChange((_event, session) => this.setSession(session));
      return client;
    });
  }

  /** Il client Supabase (per salvare dati dell'utente in futuro). */
  client(): Promise<SupabaseClient> { return this.clientPromise; }

  private setSession(session: Session | null) {
    this.zone.run(() => { this.user.set(session?.user ?? null); this.ready.set(true); });
  }

  /** Servizi attivati nel pannello di Supabase (Authentication → Providers). */
  async enabledProviders(): Promise<{ providers: typeof PROVIDERS; email: boolean }> {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
      const ext = (await r.json()).external || {};
      return { providers: PROVIDERS.filter(p => ext[p.id]), email: ext.email !== false };
    } catch {
      return { providers: PROVIDERS.filter(p => p.id === 'google'), email: true };
    }
  }

  private returnUrl() { return window.location.origin + '/account'; }

  async signInWith(provider: Provider) {
    return (await this.clientPromise).auth.signInWithOAuth({ provider, options: { redirectTo: this.returnUrl() } });
  }

  /** Invia per email un link che fa entrare senza password (crea l'account se non esiste). */
  async sendEmailLink(email: string) {
    return (await this.clientPromise).auth.signInWithOtp({ email, options: { emailRedirectTo: this.returnUrl() } });
  }

  async signOut() { return (await this.clientPromise).auth.signOut(); }

  displayName(u: User | null): string {
    if (!u) return '';
    const m = u.user_metadata || {};
    return m['full_name'] || m['name'] || u.email || 'Il mio account';
  }

  avatar(u: User | null): string | null {
    return (u?.user_metadata?.['avatar_url'] || u?.user_metadata?.['picture']) ?? null;
  }
}
