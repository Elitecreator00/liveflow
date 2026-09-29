import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

/**
 * Fingerprint completo di una stanza (ADR-0011). Generato UNA volta alla
 * creazione e mai più variato: identità browser stabili insospettiscono meno
 * gli antifrode rispetto a identità che cambiano ad ogni avvio.
 *
 * Il data-plane applica SOLO locale/acceptLanguage (preferenze del profilo),
 * timezone (TZ del container) e viewport (schermo Xvfb), in modo nativo.
 * userAgent, uaFullVersion, platform e hardwareConcurrency NON vengono più
 * applicati (28/09/2026): gli override CDP valevano solo per la pagina, mentre
 * iframe e worker vedevano il browser reale, e l'identità doppia faceva
 * fallire le verifiche Cloudflare anche completate a mano. Restano nel tipo
 * per compatibilità con le stanze già salvate.
 */
export interface RoomFingerprint {
  userAgent: string;
  /** Versione Chrome piena, es. "137.0.7151.68" (coerente con lo UA). */
  uaFullVersion: string;
  /** navigator.platform. */
  platform: string;
  /** UA-CH platform, es. "Windows". */
  platformLabel: string;
  /** UA-CH platformVersion, es. "10.0.0". */
  platformVersion: string;
  locale: string;
  acceptLanguage: string;
  timezone: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hardwareConcurrency: number;
}

/**
 * Geo selezionabili per la stanza (codice paese → locale + timezone coerenti).
 * La geo del fingerprint è una SCELTA alla creazione e resta fissa: l'operatore
 * deve poi usare proxy dello stesso paese, così IP e timezone/locale combaciano
 * (un IP USA con timezone Europa è un red flag per gli antifrode). La lista
 * deve restare allineata a BROWSER_ROOM_COUNTRIES in @liveflow/api-client.
 */
export interface GeoEntry {
  code: string;
  locale: string;
  timezone: string;
}

export const GEO_POOL: ReadonlyArray<GeoEntry> = [
  { code: 'IT', locale: 'it-IT', timezone: 'Europe/Rome' },
  { code: 'US', locale: 'en-US', timezone: 'America/New_York' },
  { code: 'GB', locale: 'en-GB', timezone: 'Europe/London' },
  { code: 'DE', locale: 'de-DE', timezone: 'Europe/Berlin' },
  { code: 'FR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  { code: 'ES', locale: 'es-ES', timezone: 'Europe/Madrid' },
  { code: 'NL', locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
  { code: 'PL', locale: 'pl-PL', timezone: 'Europe/Warsaw' },
  { code: 'PT', locale: 'pt-PT', timezone: 'Europe/Lisbon' },
  { code: 'RO', locale: 'ro-RO', timezone: 'Europe/Bucharest' },
  { code: 'CA', locale: 'en-CA', timezone: 'America/Toronto' },
  { code: 'BR', locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
];

/** Versioni Chrome stable plausibili (major.build.patch realistici). */
const CHROME_VERSIONS: ReadonlyArray<string> = [
  '135.0.7049.96',
  '136.0.7103.114',
  '137.0.7151.69',
  '138.0.7204.50',
];

/** Risoluzioni desktop comuni (statcounter top). */
const VIEWPORTS: ReadonlyArray<{ width: number; height: number }> = [
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
];

const CORES: ReadonlyArray<number> = [4, 6, 8, 12, 16];

@Injectable()
export class FingerprintService {
  /**
   * Genera un fingerprint unico e internamente coerente per una nuova stanza.
   * `country` (codice paese) fissa la geo; se assente/sconosciuto, geo casuale.
   */
  generate(country?: string): RoomFingerprint {
    const geo = resolveGeo(country);
    const version = pick(CHROME_VERSIONS);
    const major = version.split('.')[0];
    const viewport = pick(VIEWPORTS);

    return {
      userAgent:
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
        `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
      uaFullVersion: version,
      platform: 'Win32',
      platformLabel: 'Windows',
      platformVersion: '10.0.0',
      ...geoFields(geo),
      viewport,
      deviceScaleFactor: 1,
      hardwareConcurrency: pick(CORES),
    };
  }

  /**
   * Ri-geolocalizza un fingerprint esistente su un altro paese, MANTENENDO il
   * resto (UA, viewport, cores): cambiare la geo dai settings è una scelta
   * esplicita dell'operatore, non una variazione automatica.
   */
  applyCountry(fp: RoomFingerprint, country: string): RoomFingerprint {
    return { ...fp, ...geoFields(resolveGeo(country)) };
  }
}

function resolveGeo(country?: string): GeoEntry {
  if (country) {
    const found = GEO_POOL.find((g) => g.code === country.toUpperCase());
    if (found) return found;
  }
  return pick(GEO_POOL);
}

function geoFields(geo: GeoEntry): Pick<RoomFingerprint, 'locale' | 'acceptLanguage' | 'timezone'> {
  const lang = geo.locale.split('-')[0];
  return {
    locale: geo.locale,
    // Niente q-values: Chromium riversa questa stringa pari pari in
    // navigator.languages, e un "it;q=0.9" lì dentro è un'anomalia rilevabile.
    acceptLanguage: `${geo.locale},${lang},en`,
    timezone: geo.timezone,
  };
}

function pick<T>(pool: ReadonlyArray<T>): T {
  return pool[randomInt(pool.length)];
}
