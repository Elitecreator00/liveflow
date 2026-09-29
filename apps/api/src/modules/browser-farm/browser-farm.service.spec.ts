import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserRoomStatus, StreamStatus } from '@prisma/client';
import { BrowserFarmService } from './browser-farm.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { FingerprintService } from './fingerprint.service';
import { OrchestratorService, OrchestratorStartError } from './orchestrator.service';
import { SceneStateService } from '../studio/scene-state.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

const AGENCY_ID = 'agency-1';

const ACTOR: AuthenticatedUser = {
  id: 'user-1',
  email: 'owner@agency.com',
  role: 'OWNER' as AuthenticatedUser['role'],
  agencyId: AGENCY_ID,
};

const FP = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/137',
  uaFullVersion: '137.0.7151.69',
  platform: 'Win32',
  platformLabel: 'Windows',
  platformVersion: '10.0.0',
  locale: 'it-IT',
  acceptLanguage: 'it-IT,it;q=0.9,en;q=0.8',
  timezone: 'Europe/Rome',
  viewport: { width: 1536, height: 864 },
  deviceScaleFactor: 1,
  hardwareConcurrency: 8,
};

function roomRow(over: Record<string, unknown> = {}) {
  return {
    id: 'room-1',
    name: 'Stanza 1',
    fingerprint: FP,
    encryptedProxy: null,
    status: BrowserRoomStatus.IDLE,
    sourceSessionId: null,
    containerId: null,
    lastError: null,
    startedAt: null,
    stoppedAt: null,
    createdAt: new Date('2026-06-12'),
    updatedAt: new Date('2026-06-12'),
    agencyId: AGENCY_ID,
    ...over,
  };
}

const mockPrisma = {
  browserRoom: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  streamSession: { findFirst: jest.fn() },
};

// Crypto mock: encrypt/decrypt riconoscibili e reversibili.
const mockCrypto = {
  encrypt: jest.fn((s: string) => `enc(${s})`),
  decrypt: jest.fn((s: string) => s.replace(/^enc\((.*)\)$/, '$1')),
};

const mockConfig = {
  get: jest.fn(() => 'ws://lan:7880'),
  getOrThrow: jest.fn((k: string) => (k === 'LIVEKIT_API_KEY' ? 'devkey' : 'secret')),
};

// Orchestratore: per default DISABILITATO → start resta solo control-plane.
const mockOrchestrator = {
  enabled: false,
  startRoom: jest.fn(),
  stopRoom: jest.fn(),
  destroyRoom: jest.fn(),
  viewerUrl: jest.fn(
    (id: string) => `ws://vps:7090/rooms/${id}/view?token=123.abc`,
  ),
  getSourceFrame: jest.fn(),
  runtimeStatus: jest.fn(),
  identityCheck: jest.fn(),
};

// La stanza nasce con la scena corrente dello Studio: qui basta restituirne una.
const mockSceneState = { get: jest.fn().mockResolvedValue({ overlays: [], filters: {} }) };

async function buildService(): Promise<BrowserFarmService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BrowserFarmService,
      FingerprintService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: CryptoService, useValue: mockCrypto },
      { provide: ConfigService, useValue: mockConfig },
      { provide: OrchestratorService, useValue: mockOrchestrator },
      { provide: SceneStateService, useValue: mockSceneState },
    ],
  }).compile();
  return module.get(BrowserFarmService);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrchestrator.enabled = false;
});

describe('BrowserFarmService.createRoom', () => {
  it('generates a unique fingerprint, encrypts the proxy and never returns it', async () => {
    mockPrisma.browserRoom.findMany.mockResolvedValue([]);
    mockPrisma.browserRoom.create.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.createRoom(ACTOR, {
      proxy: 'http://user:pass@proxy.example:8080',
      country: 'IT',
    });

    const createArg = mockPrisma.browserRoom.create.mock.calls[0][0];
    // Fingerprint generato dal server, completo e coerente con il paese scelto.
    expect(createArg.data.fingerprint.userAgent).toContain('Chrome/');
    expect(createArg.data.fingerprint.locale).toBe('it-IT');
    expect(createArg.data.fingerprint.timezone).toBe('Europe/Rome');
    expect(createArg.data.agencyId).toBe(AGENCY_ID);
    // Proxy cifrato a riposo (C5), mai in chiaro nella risposta.
    expect(mockCrypto.encrypt).toHaveBeenCalledWith('http://user:pass@proxy.example:8080');
    expect(JSON.stringify(res)).not.toContain('user:pass');
    // L'hint mostra solo host:port.
    expect(res.proxyHint).toBe('proxy.example:8080');
  });

  it('accepts provider format host:port:user:pass and hides the password in the hint', async () => {
    mockPrisma.browserRoom.findMany.mockResolvedValue([]);
    mockPrisma.browserRoom.create.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.createRoom(ACTOR, {
      proxy: 'isp.decodo.com:10005:utente-finto:password-finta',
    });

    // L'hint mostra solo host:port — credenziali mai esposte.
    expect(res.proxyHint).toBe('isp.decodo.com:10005');
    expect(JSON.stringify(res)).not.toContain('password-finta');
    expect(JSON.stringify(res)).not.toContain('utente-finto');
  });

  it('defaults the name to "Stanza N" (max existing + 1)', async () => {
    mockPrisma.browserRoom.findMany.mockResolvedValue([
      { name: 'Stanza 1' },
      { name: 'Backup login' },
      { name: 'Stanza 7' },
    ]);
    mockPrisma.browserRoom.create.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.createRoom(ACTOR, {});
    expect(res.name).toBe('Stanza 8');
  });
});

describe('BrowserFarmService.updateRoom', () => {
  it('updates name and proxy (re-encrypted); empty proxy removes it', async () => {
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    await service.updateRoom(ACTOR, 'room-1', {
      name: 'Stanza login IT',
      proxy: 'http://u:p@new-proxy:9000',
    });
    let updateArg = mockPrisma.browserRoom.update.mock.calls[0][0];
    expect(updateArg.data.name).toBe('Stanza login IT');
    expect(updateArg.data.encryptedProxy).toBe('enc(http://u:p@new-proxy:9000)');

    await service.updateRoom(ACTOR, 'room-1', { proxy: '' });
    updateArg = mockPrisma.browserRoom.update.mock.calls[1][0];
    expect(updateArg.data.encryptedProxy).toBeNull();
  });

  it('re-geolocalizes the fingerprint when country changes (keeping the rest)', async () => {
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.updateRoom(ACTOR, 'room-1', { country: 'US' });

    const updateArg = mockPrisma.browserRoom.update.mock.calls[0][0];
    // Geo riscritta su US, UA/viewport/cores invariati.
    expect(updateArg.data.fingerprint.locale).toBe('en-US');
    expect(updateArg.data.fingerprint.timezone).toBe('America/New_York');
    expect(updateArg.data.fingerprint.userAgent).toBe(FP.userAgent);
    expect(updateArg.data.fingerprint.viewport).toEqual(FP.viewport);
    expect(res.country).toBe('US');
  });

  it('rejects a room outside the actor agency', async () => {
    mockPrisma.browserRoom.findFirst.mockResolvedValue(null);
    const service = await buildService();
    await expect(service.updateRoom(ACTOR, 'other', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BrowserFarmService.startRoom', () => {
  it('rejects a source that is not a LIVE session in the agency (C1)', async () => {
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.streamSession.findFirst.mockResolvedValue(null);

    const service = await buildService();
    await expect(
      service.startRoom(ACTOR, 'room-1', { sourceSessionId: 'nope' }),
    ).rejects.toThrow(NotFoundException);
    expect(mockPrisma.browserRoom.update).not.toHaveBeenCalled();
  });

  it('rejects starting a room that is already RUNNING', async () => {
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING }),
    );
    const service = await buildService();
    await expect(service.startRoom(ACTOR, 'room-1', {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('starts WITHOUT a source (placeholder webcam) and exposes the in-house viewUrl', async () => {
    mockOrchestrator.enabled = true;
    mockOrchestrator.startRoom.mockResolvedValue({ containerId: 'c0ffee' });
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ encryptedProxy: 'enc(http://u:p@proxy:8080)' }),
    );
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.startRoom(ACTOR, 'room-1', {});

    // Niente sorgente → niente token LiveKit nella spec.
    const spec = mockOrchestrator.startRoom.mock.calls[0][0];
    expect(spec.wsUrl).toBeUndefined();
    expect(spec.viewerToken).toBeUndefined();
    // Proxy decifrato per il data-plane (server-to-server).
    expect(spec.proxy).toBe('http://u:p@proxy:8080');
    // Fingerprint stabile della stanza, non rigenerato.
    expect(spec.fingerprint).toEqual(FP);
    expect(res.status).toBe(BrowserRoomStatus.RUNNING);
    expect(res.viewUrl).toContain('/rooms/room-1/view?token=');
  });

  it('starts from a LIVE source with a subscribe-only viewer token', async () => {
    mockOrchestrator.enabled = true;
    mockOrchestrator.startRoom.mockResolvedValue({ containerId: 'c0ffee' });
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.streamSession.findFirst.mockResolvedValue({ id: 'source-1' });
    // Update stateful: accumula i campi tra la update PROVISIONING e quella RUNNING.
    let state = roomRow();
    mockPrisma.browserRoom.update.mockImplementation(({ data }) => {
      state = { ...state, ...data };
      return Promise.resolve(state);
    });

    const service = await buildService();
    const res = await service.startRoom(ACTOR, 'room-1', {
      sourceSessionId: 'source-1',
    });

    // Sorgente cercata solo tra le sessioni LIVE dell'agenzia (C1).
    expect(mockPrisma.streamSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'source-1',
          agencyId: AGENCY_ID,
          status: StreamStatus.LIVE,
        }),
      }),
    );
    const spec = mockOrchestrator.startRoom.mock.calls[0][0];
    expect(spec.wsUrl).toBe('ws://lan:7880');
    expect(spec.viewerToken).toEqual(expect.any(String));
    expect(res.status).toBe(BrowserRoomStatus.RUNNING);
    expect(res.sourceSessionId).toBe('source-1');
  });

  it('marks ERROR and surfaces the operator-facing reason from the data-plane', async () => {
    mockOrchestrator.enabled = true;
    mockOrchestrator.startRoom.mockRejectedValue(
      new OrchestratorStartError(
        'FARM_DEVICE_MISSING',
        'Il server non ha webcam virtuali attive (modulo v4l2loopback non caricato).',
        "[video4linux2,v4l2] Unable to open V4L2 device '/dev/video11'",
      ),
    );
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    await expect(service.startRoom(ACTOR, 'room-1', {})).rejects.toThrow(
      /webcam virtuali attive/,
    );
    const lastUpdate = mockPrisma.browserRoom.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.status).toBe(BrowserRoomStatus.ERROR);
    expect(lastUpdate.data.lastError).toBe(
      'Il server non ha webcam virtuali attive (modulo v4l2loopback non caricato).',
    );
    // Il dump tecnico non deve mai finire sotto gli occhi dell'operatore.
    expect(lastUpdate.data.lastError).not.toContain('Unable to open V4L2 device');
  });

  it('falls back to a generic message when the failure has no known code', async () => {
    mockOrchestrator.enabled = true;
    mockOrchestrator.startRoom.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:7090'),
    );
    mockPrisma.browserRoom.findFirst.mockResolvedValue(roomRow());
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    await expect(service.startRoom(ACTOR, 'room-1', {})).rejects.toThrow(
      /Avvio della stanza non riuscito/,
    );
    const lastUpdate = mockPrisma.browserRoom.update.mock.calls.at(-1)[0];
    expect(lastUpdate.data.status).toBe(BrowserRoomStatus.ERROR);
    expect(lastUpdate.data.lastError).not.toContain('ECONNREFUSED');
  });
});

describe('BrowserFarmService.stopRoom / deleteRoom', () => {
  it('stops the room back to IDLE keeping the persistent profile', async () => {
    mockOrchestrator.enabled = true;
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING, containerId: 'c0ffee' }),
    );
    mockPrisma.browserRoom.update.mockImplementation(({ data }) =>
      Promise.resolve(roomRow({ ...data })),
    );

    const service = await buildService();
    const res = await service.stopRoom(ACTOR, 'room-1');
    expect(mockOrchestrator.stopRoom).toHaveBeenCalledWith('room-1');
    expect(mockOrchestrator.destroyRoom).not.toHaveBeenCalled();
    expect(res.status).toBe(BrowserRoomStatus.IDLE);
    expect(res.viewUrl).toBeNull();
  });

  it('deletes the room destroying the data-plane profile too', async () => {
    mockOrchestrator.enabled = true;
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING }),
    );
    mockPrisma.browserRoom.delete.mockResolvedValue(roomRow());

    const service = await buildService();
    await service.deleteRoom(ACTOR, 'room-1');
    expect(mockOrchestrator.stopRoom).toHaveBeenCalledWith('room-1');
    expect(mockOrchestrator.destroyRoom).toHaveBeenCalledWith('room-1');
    expect(mockPrisma.browserRoom.delete).toHaveBeenCalledWith({
      where: { id: 'room-1' },
    });
  });
});

describe(`BrowserFarmService.getSourceFrame`, () => {
  // I siti mostrano la propria anteprima ribaltata: questo fotogramma è l'unico
  // modo di vedere cosa riceve davvero il pubblico.
  it(`restituisce il fotogramma della sorgente per una stanza attiva`, async () => {
    mockOrchestrator.enabled = true;
    const frame = Buffer.from([0xff, 0xd8, 0xff]);
    mockOrchestrator.getSourceFrame.mockResolvedValue(frame);
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING }),
    );

    const service = await buildService();
    await expect(service.getSourceFrame(ACTOR, `room-1`)).resolves.toBe(frame);
  });

  it(`rifiuta una stanza ferma invece di restituire un'immagine vecchia`, async () => {
    mockOrchestrator.enabled = true;
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.IDLE }),
    );

    const service = await buildService();
    await expect(service.getSourceFrame(ACTOR, `room-1`)).rejects.toThrow(/non è attiva/);
  });

  it(`spiega quando il device non risponde`, async () => {
    mockOrchestrator.enabled = true;
    mockOrchestrator.getSourceFrame.mockResolvedValue(null);
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING }),
    );

    const service = await buildService();
    await expect(service.getSourceFrame(ACTOR, `room-1`)).rejects.toThrow(/non leggibile/);
  });
});

describe('BrowserFarmService — verifiche anti-bot e identità', () => {
  it('mostra solo le stanze della propria agenzia nello stato vivo', async () => {
    // Il data-plane non conosce i tenant: il filtro deve stare qui.
    mockOrchestrator.enabled = true;
    mockOrchestrator.runtimeStatus.mockResolvedValue({
      'room-1': { captcha: { type: 'hcaptcha', since: 1000 }, mirror: false, viewers: 1 },
      'room-di-altri': { captcha: null, mirror: false, viewers: 0 },
    });
    mockPrisma.browserRoom.findMany.mockResolvedValue([
      { id: 'room-1', status: BrowserRoomStatus.RUNNING },
    ]);

    const service = await buildService();
    const status = await service.runtimeStatus(ACTOR);

    expect(Object.keys(status)).toEqual(['room-1']);
    expect(status['room-1'].captcha?.type).toBe('hcaptcha');
  });


  it('riallinea le stanze che il data-plane non conosce più', async () => {
    // Dopo un riavvio della farm il database diceva ancora RUNNING: la Console
    // mostrava stanze "attive" che non esistevano, complete di proxy e paese,
    // quindi sembrava tutto a posto.
    mockOrchestrator.enabled = true;
    mockOrchestrator.runtimeStatus.mockResolvedValue({});
    mockPrisma.browserRoom.findMany.mockResolvedValue([
      { id: 'fantasma', status: BrowserRoomStatus.RUNNING },
    ]);

    const service = await buildService();
    await service.runtimeStatus(ACTOR);

    expect(mockPrisma.browserRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['fantasma'] } },
        data: expect.objectContaining({ status: BrowserRoomStatus.IDLE }),
      }),
    );
  });

  it('non spegne nulla se il data-plane non risponde', async () => {
    // "Nessuna stanza attiva" e "non ho potuto chiedere" sono cose diverse:
    // confonderle spegnerebbe stanze vive a ogni disguido di rete.
    mockOrchestrator.enabled = true;
    mockOrchestrator.runtimeStatus.mockResolvedValue(null);
    mockPrisma.browserRoom.findMany.mockResolvedValue([
      { id: 'room-1', status: BrowserRoomStatus.RUNNING },
    ]);

    const service = await buildService();
    const status = await service.runtimeStatus(ACTOR);

    expect(status).toEqual({});
    expect(mockPrisma.browserRoom.updateMany).not.toHaveBeenCalled();
  });
  it('restituisce la diagnosi di identità per una stanza attiva', async () => {
    mockOrchestrator.enabled = true;
    const report = { exit: {}, browser: {}, findings: [{ level: 'ok', message: 'ok' }] };
    mockOrchestrator.identityCheck.mockResolvedValue(report);
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.RUNNING }),
    );

    const service = await buildService();
    await expect(service.identityCheck(ACTOR, 'room-1')).resolves.toBe(report);
  });

  it('non diagnostica una stanza ferma', async () => {
    mockOrchestrator.enabled = true;
    mockPrisma.browserRoom.findFirst.mockResolvedValue(
      roomRow({ status: BrowserRoomStatus.IDLE }),
    );

    const service = await buildService();
    await expect(service.identityCheck(ACTOR, 'room-1')).rejects.toThrow(/non è attiva/);
  });
});
