// Rilevamento delle verifiche anti-bot nelle stanze.
//
// SCOPO: avvisare l'operatore che una stanza si è fermata su un CAPTCHA, così
// può aprirla e completarlo **di persona** dal viewer (mouse e tastiera reali
// passano già per la sessione CDP). Qui NON si risolve nulla in automatico: un
// CAPTCHA è la domanda "sei umano adesso?", e la risposta deve darla una persona.
//
// COME: si ascolta il TRAFFICO di rete della scheda (CDP Network), non si esegue
// codice nella pagina. La prima versione interrogava ogni stanza con un
// Runtime.evaluate ogni 5 secondi: funzionava, ma aggiungeva un'esecuzione JS
// periodica su ogni sito visitato — esattamente il tipo di impronta che si cerca
// di non lasciare (il probe del cursore, per lo stesso motivo, è throttlato e
// non abilita Runtime). Le richieste di rete invece il browser le fa comunque.
//
// Il segnale non è "esiste un widget" ma "è stata aperta una sfida": quasi ogni
// sito carica un reCAPTCHA v3 invisibile, e segnalarlo renderebbe l'avviso
// inutile in un giorno.

/** URL che compaiono SOLO quando una sfida viene realmente presentata. */
const CHALLENGE_PATTERNS = [
  [/recaptcha\/(api2|enterprise)\/(bframe|payload)/, 'recaptcha'],
  [/hcaptcha\.com\/(captcha\/v1\/[^/]+\/(challenge|frame)|challenge)/, 'hcaptcha'],
  [/challenges\.cloudflare\.com\/cdn-cgi\/challenge-platform/, 'turnstile'],
  [/(arkoselabs|funcaptcha)\.com\/fc\/(gt2|api)/, 'arkose'],
];

/** Richieste che indicano una verifica SUPERATA: la sfida si chiude. */
const SOLVED_PATTERNS = [
  /recaptcha\/(api2|enterprise)\/userverify/,
  /hcaptcha\.com\/checkcaptcha/,
];

/**
 * Senza nuove richieste per questo tempo la sfida si considera chiusa: alcuni
 * widget spariscono senza una chiamata di conferma riconoscibile.
 */
export const CAPTCHA_IDLE_MS = 25_000;

/** Il traffico dice che è in corso una sfida? Ritorna il tipo, o null. */
export function classifyRequest(url) {
  const u = String(url || '');
  for (const [re, type] of CHALLENGE_PATTERNS) {
    if (re.test(u)) return type;
  }
  return null;
}

/** Il traffico dice che la verifica è stata superata? */
export function isSolvedRequest(url) {
  const u = String(url || '');
  return SOLVED_PATTERNS.some((re) => re.test(u));
}

/**
 * Nuovo stato dopo una richiesta osservata.
 *
 * `since` resta fermo finché la sfida è la stessa, così la Console può dire da
 * quanto la stanza è in attesa; `lastSeen` serve a farla scadere da sola.
 *
 * @param {{type: string, since: number, lastSeen: number}|null} previous
 * @param {string} url
 * @param {number} now
 */
export function applyRequest(previous, url, now = Date.now()) {
  if (isSolvedRequest(url)) return null;
  const type = classifyRequest(url);
  if (!type) return previous;
  if (previous && previous.type === type) return { ...previous, lastSeen: now };
  return { type, since: now, lastSeen: now };
}

/** Scade una sfida di cui non si vede più traffico. */
export function expireIfIdle(state, now = Date.now()) {
  if (!state) return null;
  return now - state.lastSeen > CAPTCHA_IDLE_MS ? null : state;
}
