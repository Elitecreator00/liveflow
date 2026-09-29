// Identità NATIVA del browser di stanza (ADR-0011, rev. 28/09/2026).
//
// Lingua, fuso e schermo si impostano come li imposterebbe un utente vero:
// preferenze del profilo, variabili d'ambiente, dimensione del display. Così
// valgono identiche in OGNI contesto del browser — pagina, iframe fuori
// processo (es. il widget Turnstile di Cloudflare), worker, header HTTP.
//
// Prima si passava da override CDP (Emulation.*), che agiscono solo sulla
// sessione della pagina a cui sono applicati: l'iframe della verifica vedeva
// Linux/Chromium 152/en-US mentre la pagina dichiarava Windows/Chrome 136/en-GB.
// Nessun browser reale è due cose insieme, e la verifica non passava mai,
// nemmeno completata a mano.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lista lingue senza duplicati né q-values, es. "en-GB,en" (non "en-GB,en,en":
 * il generatore aggiungeva "en" in coda anche quando la lingua base era già
 * "en", e il duplicato finiva pari pari in navigator.languages).
 */
export function acceptLanguages(fp) {
  const raw = fp?.acceptLanguage || fp?.locale || 'it-IT';
  const out = [];
  for (const part of String(raw).split(',')) {
    const tag = part.split(';')[0].trim();
    if (tag && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.join(',');
}

/**
 * Scrive la lingua nelle preferenze del profilo PRIMA di avviare Chromium
 * (il profilo è un volume dell'host). Il resto delle preferenze resta intatto;
 * un file illeggibile o corrotto viene sostituito, come farebbe Chromium.
 */
export function writeLanguagePrefs(profileDir, fp) {
  const dir = join(profileDir, 'Default');
  const file = join(dir, 'Preferences');
  mkdirSync(dir, { recursive: true });
  let prefs = {};
  try {
    prefs = JSON.parse(readFileSync(file, 'utf8'));
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  } catch {
    prefs = {};
  }
  const langs = acceptLanguages(fp);
  prefs.intl = { ...(prefs.intl ?? {}), accept_languages: langs, selected_languages: langs };
  writeFileSync(file, JSON.stringify(prefs));
  return langs;
}
