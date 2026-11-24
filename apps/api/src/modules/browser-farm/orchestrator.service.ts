import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { RoomFingerprint } from './fingerprint.service';

/** Spec di avvio stanza inviata al data-plane (farm in-house sul VPS, ADR-0011). */
export interface StartRoomInput {
  roomId: string;
  /** Nome operatore (solo per i log del data-plane). */
  name: string;
  /** Fingerprint stabile della stanza, applicato via CDP + flag di lancio. */
  fingerprint: RoomFingerprint;
  /** Proxy in chiaro (server-to-server); '' = nessun proxy. */
  proxy: string;
  /** Home page della stanza; assente = home predefinita del data-plane. */
  homeUrl?: string;
  /** Specchio della sorgente al momento dell'avvio. */
  mirror?: boolean;
  /** Scena (overlay + filtri) al momento dell'avvio. */
  scene?: unknown;
  /** Sorgente Studio da iniettare come webcam virtuale; assenti = placeholder. */
  wsUrl?: string;
  viewerToken?: string;
}

export interface StartRoomResult {
  containerId: string;
}

/** Verifica anti-bot in corso in una stanza (da completare a mano). */
export interface CaptchaState {
  /** recaptcha | hcaptcha | turnstile | arkose | cloudflare | captcha */
  type: string;
  /** Da quando è comparsa (epoch ms): dice da quanto la stanza è ferma. */
  since: number;
}

export interface IdentitySummary {
  checkedAt: number;
  /** Rilievo più grave trovato: guida il colore del badge in Console. */
  worst: "ok" | "warn" | "error";
  findings: IdentityFinding[];
}

export interface RoomRuntimeStatus {
  captcha: CaptchaState | null;
  mirror: boolean;
  viewers: number;
  /** Esito della verifica automatica eseguita all'avvio della stanza. */
  identity?: IdentitySummary | null;
}

export interface IdentityFinding {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

export interface IdentityReport {
  exit: {
    ip: string | null;
    country: string | null;
    countryCode: string | null;
    city: string | null;
    timezone: string | null;
    isp: string | null;
  };
  browser: {
    timezone: string;
    language: string;
    languages: string;
    platform: string;
    screen: string;
    webdriver: boolean;
    webgl?: string | null;
  };
  findings: IdentityFinding[];
}

/**
 * Avvio rifiutato dal data-plane. `message` è già la frase per l'operatore
 * (il data-plane la produce insieme a un `code`: webcam virtuali assenti,
 * proxy che non risponde, pool esaurito…); `detail` è il dump tecnico, che
 * finisce nei log e non nella Console.
 */
export class OrchestratorStartError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail: string = '',
  ) {
    super(message);
    this.name = 'OrchestratorStartError';
  }
}

/** Corpo di errore del data-plane (farm/orchestrator.mjs). */
interface FarmErrorBody {
  code?: string;
  error?: string;
  detail?: string;
}

/** Fallback quando il data-plane non risponde affatto (rete, processo giù). */
const ORCHESTRATOR_UNREACHABLE =
  'Il server delle stanze non risponde. Riprova tra poco; se persiste serve un ' +
  "intervento dell'amministratore.";

/**
 * OrchestratorService — client HTTP del data-plane in-house (ADR-0011).
 * Il data-plane accende/spegne il browser isolato della stanza (container
 * nostro: Chromium+Xvfb, NIENTE servizi terzi) e fa da gateway WebSocket per
 * il viewer (CDP screencast + input). Autenticazione server-to-server con
 * header `x-orch-token`; il viewer usa un token HMAC firmato a scadenza.
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(private readonly config: ConfigService) {}

  /** L'orchestratore è configurato? Se no, start resta solo control-plane. */
  get enabled(): boolean {
    return !!this.config.get<string>('ORCHESTRATOR_URL');
  }

  async startRoom(input: StartRoomInput): Promise<StartRoomResult> {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl()}/rooms/${encodeURIComponent(input.roomId)}/start`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-orch-token': this.token() },
          body: JSON.stringify(input),
        },
      );
    } catch (e) {
      throw new OrchestratorStartError(
        'FARM_UNREACHABLE',
        ORCHESTRATOR_UNREACHABLE,
        String(e),
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw this.toStartError(res.status, body);
    }
    return (await res.json()) as StartRoomResult;
  }

  /**
   * Risposta di errore del data-plane → errore con frase leggibile. Il corpo
   * atteso è `{ code, error, detail }`; se manca (data-plane vecchio, proxy
   * HTTP di mezzo, HTML) si ricade su un messaggio generico anziché mostrare
   * il corpo grezzo.
   */
  private toStartError(status: number, body: string): OrchestratorStartError {
    let parsed: FarmErrorBody | null = null;
    try {
      parsed = JSON.parse(body) as FarmErrorBody;
    } catch {
      parsed = null;
    }
    // Il data-plane parla italiano solo per gli errori nuovi: i pochi tecnici
    // rimasti (409/401) li traduciamo qui.
    if (status === 409) {
      return new OrchestratorStartError(
        'ROOM_ALREADY_RUNNING',
        'La stanza risulta già attiva sul server. Fermala e riavviala.',
        body,
      );
    }
    if (status === 401) {
      return new OrchestratorStartError(
        'FARM_UNAUTHORIZED',
        'Il server delle stanze ha rifiutato la richiesta (configurazione del ' +
          "token non valida). Serve un intervento dell'amministratore.",
        body,
      );
    }
    const known = parsed?.error && parsed.error.length <= 500 ? parsed.error : null;
    return new OrchestratorStartError(
      parsed?.code ?? 'FARM_UNAVAILABLE',
      known ?? ORCHESTRATOR_UNREACHABLE,
      parsed?.detail ?? body.slice(0, 2000),
    );
  }

  /**
   * Accende/spegne lo specchio della sorgente in una stanza attiva.
   * Best-effort: se la stanza non ha sorgente il data-plane risponde 409 e
   * non è un errore per il chiamante.
   */
  async setRoomMirror(roomId: string, mirror: boolean): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}/mirror`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-orch-token': this.token() },
          body: JSON.stringify({ mirror }),
        },
      );
      if (!res.ok && res.status !== 409) {
        this.logger.warn(`orchestrator mirror ${roomId}: HTTP ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`orchestrator mirror ${roomId} failed: ${String(e)}`);
    }
  }

  /**
   * Manda la scena (overlay + filtri) alla stanza, che la compone nel
   * filtergraph dell'ingestor. Best-effort: una stanza senza sorgente
   * risponde 409 e non è un errore per il chiamante.
   */
  async setRoomScene(roomId: string, scene: unknown): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}/scene`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-orch-token': this.token() },
          body: JSON.stringify({ scene }),
        },
      );
      if (!res.ok && res.status !== 409) {
        this.logger.warn(`orchestrator scene ${roomId}: HTTP ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`orchestrator scene ${roomId} failed: ${String(e)}`);
    }
  }

  /**
   * Fotogramma della sorgente come la riceve il sito nella stanza.
   * null se la stanza non è avviata o il device non risponde.
   */
  async getSourceFrame(roomId: string): Promise<Buffer | null> {
    try {
      const res = await fetch(
        `${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}/source-frame`,
        { headers: { 'x-orch-token': this.token() } },
      );
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      this.logger.warn(`orchestrator source-frame ${roomId} failed: ${String(e)}`);
      return null;
    }
  }

  /**
   * Stato vivo delle stanze sul data-plane (verifiche anti-bot in corso,
   * specchio, spettatori). Non sta nel database: cambia di secondo in secondo.
   */
  /**
   * `null` = data-plane non raggiungibile (diverso da "nessuna stanza attiva"):
   * senza questa distinzione, un data-plane giù farebbe sembrare spente tutte
   * le stanze e la riconciliazione le spegnerebbe davvero.
   */
  async runtimeStatus(): Promise<Record<string, RoomRuntimeStatus> | null> {
    try {
      const res = await fetch(`${this.baseUrl()}/rooms`, {
        headers: { 'x-orch-token': this.token() },
      });
      if (!res.ok) return null;
      const rooms = (await res.json()) as Array<
        RoomRuntimeStatus & { roomId: string }
      >;
      return Object.fromEntries(
        rooms.map(({ roomId, captcha, mirror, viewers, identity }) => [
          roomId,
          {
            captcha: captcha ?? null,
            mirror: !!mirror,
            viewers: viewers ?? 0,
            identity: identity ?? null,
          },
        ]),
      );
    } catch (e) {
      this.logger.warn(`orchestrator runtime status failed: ${String(e)}`);
      return null;
    }
  }

  /** Diagnosi di coerenza fra uscita di rete e identità del browser. */
  async identityCheck(roomId: string): Promise<IdentityReport> {
    const res = await fetch(
      `${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}/identity`,
      { headers: { 'x-orch-token': this.token() } },
    );
    const body = (await res.json().catch(() => null)) as IdentityReport | null;
    if (!res.ok || !body) {
      throw new Error(
        (body as { error?: string } | null)?.error ??
          'Diagnosi non riuscita: il data-plane non ha risposto.',
      );
    }
    return body;
  }

  /** Best-effort: il teardown non deve far fallire lo stop lato control-plane. */
  async stopRoom(roomId: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}/stop`,
        { method: 'POST', headers: { 'x-orch-token': this.token() } },
      );
      if (!res.ok) this.logger.warn(`orchestrator stop ${roomId}: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`orchestrator stop ${roomId} failed: ${String(e)}`);
    }
  }

  /**
   * Distrugge la stanza sul data-plane: container + profilo browser persistente
   * (cookie/sessioni). Da chiamare SOLO alla cancellazione della stanza.
   */
  async destroyRoom(roomId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl()}/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: { 'x-orch-token': this.token() },
      });
      if (!res.ok && res.status !== 404) {
        this.logger.warn(`orchestrator destroy ${roomId}: HTTP ${res.status}`);
      }
    } catch (e) {
      this.logger.warn(`orchestrator destroy ${roomId} failed: ${String(e)}`);
    }
  }

  /**
   * URL WebSocket del viewer in-house per l'operatore, con token HMAC a
   * scadenza (12h) legato alla stanza. Il data-plane verifica firma+scadenza
   * con lo stesso segreto ORCH_TOKEN: il browser dell'operatore non vede mai
   * il segreto.
   */
  viewerUrl(roomId: string): string | null {
    const base = this.config.get<string>('ORCHESTRATOR_URL');
    if (!base) return null;
    // URL pubblico WSS per il browser dell'operatore. ORCHESTRATOR_URL punta al
    // loopback del data-plane (http://127.0.0.1:7090, per le chiamate server→
    // orchestrator) — NON è raggiungibile dal browser e in HTTPS sarebbe anche
    // mixed-content. Se configurato, ORCHESTRATOR_PUBLIC_WS_URL (es.
    // wss://app.liveflow.me/__farmws) ha la precedenza per il viewer.
    const pub = this.config.get<string>('ORCHESTRATOR_PUBLIC_WS_URL');
    const wsBase = pub
      ? pub.replace(/\/$/, '')
      : base.replace(/^http/, 'ws').replace(/\/$/, '');
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const sig = createHmac('sha256', this.token())
      .update(`${roomId}.${exp}`)
      .digest('hex');
    return `${wsBase}/rooms/${encodeURIComponent(roomId)}/view?token=${exp}.${sig}`;
  }

  private baseUrl(): string {
    return (this.config.get<string>('ORCHESTRATOR_URL') ?? '').replace(/\/$/, '');
  }

  private token(): string {
    return this.config.get<string>('ORCH_TOKEN') ?? '';
  }
}
