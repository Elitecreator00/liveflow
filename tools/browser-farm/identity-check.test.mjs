// Test della diagnosi di coerenza dell'identità e dello stato CAPTCHA.
//   node --test tools/browser-farm/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareIdentity } from './identity-check.mjs';
import { applyRequest, expireIfIdle, classifyRequest } from './captcha-watch.mjs';

const EXIT = { countryCode: 'IT', timezone: 'Europe/Rome', isp: 'Fastweb', ip: '1.2.3.4' };

// Caso sano: il browser esce esattamente da dove esce il proxy.
const coherent = {
  exit: EXIT,
  browserExit: { ...EXIT },
  browser: { timezone: 'Europe/Rome', language: 'it-IT', webdriver: false },
  proxyConfigured: true,
};

test('identità coerente: nessun rilievo da correggere', () => {
  const out = compareIdentity(coherent);
  assert.equal(out.length, 1);
  assert.equal(out[0].level, 'ok');
});

test('fuso orario discordante è un errore, non un avviso', () => {
  // È la prima incoerenza che i siti controllano: uscita UK con orologio italiano.
  const out = compareIdentity({
    ...coherent,
    // Il proxy e il browser escono entrambi da UK: l'incoerenza è col fuso del browser.
    exit: { ...coherent.exit, countryCode: 'GB', timezone: 'Europe/London' },
    browserExit: { ...coherent.exit, countryCode: 'GB', timezone: 'Europe/London' },
  });
  const tz = out.find((f) => /Fuso orario/.test(f.message));
  assert.ok(tz);
  assert.equal(tz.level, 'error');
});

test('lingua di un altro paese è solo un avviso (gli espatriati esistono)', () => {
  const out = compareIdentity({
    ...coherent,
    exit: { ...coherent.exit, countryCode: 'GB', timezone: 'Europe/Rome' },
    browserExit: { ...coherent.exit, countryCode: 'GB', timezone: 'Europe/Rome' },
  });
  const lang = out.find((f) => /Lingua e paese/.test(f.message));
  assert.ok(lang);
  assert.equal(lang.level, 'warn');
});

test('stanza senza proxy: segnalata come errore', () => {
  const out = compareIdentity({ ...coherent, proxyConfigured: false });
  assert.equal(out[0].level, 'error');
  assert.match(out[0].message, /senza proxy/);
});

test('navigator.webdriver esposto è un errore', () => {
  const out = compareIdentity({
    ...coherent,
    browser: { ...coherent.browser, webdriver: true },
  });
  assert.ok(out.some((f) => f.level === 'error' && /webdriver/.test(f.message)));
});

test('IP da datacenter: avviso con il nome del fornitore', () => {
  const out = compareIdentity({
    ...coherent,
    exit: { ...coherent.exit, isp: 'OVH SAS' },
    browserExit: { ...coherent.exit, isp: 'OVH SAS' },
  });
  const dc = out.find((f) => /datacenter/.test(f.message));
  assert.ok(dc);
  assert.equal(dc.level, 'warn');
  assert.match(dc.message, /OVH SAS/);
});

test('i rilievi più gravi vengono per primi', () => {
  const out = compareIdentity({
    exit: { countryCode: 'GB', timezone: 'Europe/London', isp: 'OVH SAS' },
    browser: { timezone: 'Europe/Rome', language: 'it-IT', webdriver: true },
    proxyConfigured: true,
  });
  assert.equal(out[0].level, 'error');
  assert.ok(out.findIndex((f) => f.level === 'warn') > out.findIndex((f) => f.level === 'error'));
});

test('dati parziali non producono falsi allarmi', () => {
  // Se il geo-IP non restituisce il fuso, non si inventa un'incoerenza.
  const out = compareIdentity({
    exit: { ip: '1.2.3.4' },
    browserExit: { ip: '1.2.3.4' },
    browser: { timezone: 'Europe/Rome', language: 'it-IT', webdriver: false },
    proxyConfigured: true,
  });
  assert.equal(out[0].level, 'ok');
});

test('riconosce una sfida aperta dal traffico, non dal widget presente', () => {
  // Il bframe viene caricato SOLO quando la sfida si apre davvero.
  assert.equal(classifyRequest('https://www.google.com/recaptcha/api2/bframe?k=x'), 'recaptcha');
  assert.equal(classifyRequest('https://hcaptcha.com/captcha/v1/abc/challenge'), 'hcaptcha');
  assert.equal(classifyRequest('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x'), 'turnstile');
});

test('il reCAPTCHA v3 invisibile non è una sfida', () => {
  // Quasi ogni sito lo carica: segnalarlo renderebbe l'avviso inutile.
  assert.equal(classifyRequest('https://www.google.com/recaptcha/api.js?render=abc'), null);
  assert.equal(classifyRequest('https://www.gstatic.com/recaptcha/releases/x/recaptcha__it.js'), null);
});

test('la stessa sfida non fa ripartire il cronometro', () => {
  const first = applyRequest(null, 'https://x/recaptcha/api2/bframe', 1000);
  const later = applyRequest(first, 'https://x/recaptcha/api2/bframe', 9000);
  assert.equal(later.since, 1000); // l'operatore vede da quanto è ferma
  assert.equal(later.lastSeen, 9000);
});

test('la verifica superata azzera lo stato', () => {
  const st = applyRequest(null, 'https://x/recaptcha/api2/bframe', 1000);
  assert.equal(applyRequest(st, 'https://x/recaptcha/api2/userverify', 2000), null);
});

test('una sfida senza più traffico scade da sola', () => {
  const st = applyRequest(null, 'https://x/recaptcha/api2/bframe', 1000);
  assert.ok(expireIfIdle(st, 10_000)); // ancora viva
  assert.equal(expireIfIdle(st, 40_000), null); // chiusa senza conferma esplicita
});

test('smaschera un browser che NON usa il proxy configurato', () => {
  // Il caso peggiore: la card mostra il proxy, ma il browser esce dal server.
  const out = compareIdentity({
    exit: { ip: '45.154.151.120', city: 'London', countryCode: 'GB', timezone: 'Europe/London' },
    browserExit: { ip: '51.75.1.1', city: 'Milan', countryCode: 'IT', timezone: 'Europe/Rome' },
    browser: { timezone: 'Europe/London', language: 'en-GB', webdriver: false },
    proxyConfigured: true,
  });
  const leak = out.find((f) => /NON sta usando il proxy/.test(f.message));
  assert.ok(leak);
  assert.equal(leak.level, 'error');
  assert.match(leak.message, /51\.75\.1\.1 \(Milan\)/);
  assert.match(leak.message, /45\.154\.151\.120 \(London\)/);
});

test('browser e proxy che coincidono non generano allarmi', () => {
  const same = { ip: '45.154.151.120', city: 'London', countryCode: 'GB', timezone: 'Europe/London' };
  const out = compareIdentity({
    exit: same,
    browserExit: { ...same },
    browser: { timezone: 'Europe/London', language: 'en-GB', webdriver: false, webgl: 'ANGLE' },
    proxyConfigured: true,
  });
  assert.equal(out[0].level, 'ok');
});

test('le incoerenze si misurano sull uscita del BROWSER, non del proxy', () => {
  // Se il browser esce altrove, il fuso va confrontato con quello vero.
  const out = compareIdentity({
    exit: { ip: '1.1.1.1', countryCode: 'GB', timezone: 'Europe/London' },
    browserExit: { ip: '2.2.2.2', countryCode: 'IT', timezone: 'Europe/Rome' },
    browser: { timezone: 'Europe/London', language: 'en-GB', webdriver: false },
    proxyConfigured: true,
  });
  assert.ok(out.some((f) => /esce da Europe\/Rome/.test(f.message)));
});

test('senza misura del browser lo dice invece di dare per buono il proxy', () => {
  const out = compareIdentity({
    exit: { ip: '1.1.1.1', countryCode: 'GB', timezone: 'Europe/London' },
    browserExit: null,
    browser: { timezone: 'Europe/London', language: 'en-GB', webdriver: false },
    proxyConfigured: true,
  });
  assert.ok(out.some((f) => f.level === 'warn' && /verifica del proxy resta incompleta/.test(f.message)));
});
