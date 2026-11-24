// Home page delle stanze (prima pagina all'avvio + nuove tab).
// Modulo senza dipendenze: testabile anche fuori dal VPS.

// Predefinita se la stanza non ne ha una: ROOM_HOME_URL dell'ambiente della
// farm, altrimenti Google.
export const DEFAULT_HOME_URL = process.env.ROOM_HOME_URL || 'https://www.google.com/';

/** Solo indirizzi web: qualsiasi altra cosa ricade sulla home predefinita. */
export function resolveHomeUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch { /* non valido */ }
  return DEFAULT_HOME_URL;
}
