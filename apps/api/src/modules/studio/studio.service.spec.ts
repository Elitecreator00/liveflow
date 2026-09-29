import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { StreamStatus } from '@prisma/client';
import { StudioService } from './studio.service';
import { SceneStateService } from './scene-state.service';
import { EgressOrchestrator } from './egress.orchestrator';
import { BrowserFarmService } from '../browser-farm/browser-farm.service';
import { PrismaService } from '../../prisma/prisma.service';

// ── Mock livekit-server-sdk ──────────────────────────────────────────────────
//
// We mock the entire livekit-server-sdk module so tests run without a real
// LiveKit server. The mock captures grant arguments so we can assert on them.

const mockAddGrant = jest.fn();
const mockToJwt = jest.fn().mockReturnValue('mock-livekit-token');

jest.mock('livekit-server-sdk', () => {
  return {
    AccessToken: jest.fn().mockImplementation(() => ({
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
    })),
    RoomServiceClient: jest.fn().mockImplementation(() => ({
      deleteRoom: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LIVEKIT_API_KEY = 'devkey';
const LIVEKIT_API_SECRET = 'secret';
const AGENCY_ID = 'agency-test-1';
const CREATOR_ID = 'creator-test-1';
const SESSION_ID = 'session-test-1';

const mockActor = {
  id: CREATOR_ID,
  email: 'creator@test.com',
  role: 'CREATOR' as const,
  agencyId: AGENCY_ID,
};

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPrisma = {
  streamSession: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  creator: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
};

// ── SceneState mock ─────────────────────────────────────────────────────────
const mockSceneState = {
  get: jest.fn(),
  replace: jest.fn(),
  clear: jest.fn(),
};

const mockEgress = {
  stopInternal: jest.fn().mockResolvedValue(undefined),
};

// Lo specchio della sorgente viene propagato alle stanze: qui basta osservarlo.
const mockBrowserFarm = {
  applySourceMirror: jest.fn(),
  applySourceScene: jest.fn(),
};

// ── Config mock ───────────────────────────────────────────────────────────────

const mockConfig = {
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'LIVEKIT_API_KEY') return LIVEKIT_API_KEY;
    if (key === 'LIVEKIT_API_SECRET') return LIVEKIT_API_SECRET;
    throw new Error(`Unknown key: ${key}`);
  }),
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'LIVEKIT_URL') return 'ws://localhost:7880';
    if (key === 'LIVEKIT_WS_PUBLIC_URL') return 'ws://localhost:7880';
    return undefined;
  }),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StudioService', () => {
  let service: StudioService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockToJwt.mockReturnValue('mock-livekit-token');
    mockPrisma.creator.findUnique.mockResolvedValue({ id: CREATOR_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: SceneStateService, useValue: mockSceneState },
        { provide: EgressOrchestrator, useValue: mockEgress },
        { provide: BrowserFarmService, useValue: mockBrowserFarm },
      ],
    }).compile();

    service = module.get<StudioService>(StudioService);
  });

  // ── createIngestSession ──────────────────────────────────────────────────────

  describe('createIngestSession', () => {
    const createdSession = {
      id: SESSION_ID,
      streamKey: CREATOR_ID,
      status: StreamStatus.LIVE,
      startedAt: new Date(),
      createdAt: new Date(),
      agencyId: AGENCY_ID,
      creatorId: CREATOR_ID,
    };

    beforeEach(() => {
      mockPrisma.streamSession.create.mockResolvedValue(createdSession);
    });

    it('creates session with status LIVE', async () => {
      await service.createIngestSession(mockActor);

      expect(mockPrisma.streamSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: StreamStatus.LIVE,
            agencyId: AGENCY_ID,
            creatorId: CREATOR_ID,
          }),
        }),
      );
    });

    it('returns sessionId, roomName (== sessionId), wsUrl, creatorToken', async () => {
      const result = await service.createIngestSession(mockActor);

      expect(result.sessionId).toBe(SESSION_ID);
      expect(result.roomName).toBe(SESSION_ID);
      expect(result.wsUrl).toBe('ws://localhost:7880');
      expect(result.creatorToken).toBe('mock-livekit-token');
    });

    it('creator token grant: canPublish=true, canSubscribe=true (subscriber PC primaria)', async () => {
      await service.createIngestSession(mockActor);

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          room: SESSION_ID,
        }),
      );
    });

    it('resolves the linked creator as creatorId when dto.creatorId is omitted', async () => {
      await service.createIngestSession(mockActor);

      const callArgs = mockPrisma.streamSession.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(callArgs.data['creatorId']).toBe(CREATOR_ID);
    });

    it('uses a unique per-session streamKey (NOT the creatorId)', async () => {
      await service.createIngestSession(mockActor);

      const callArgs = mockPrisma.streamSession.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      const streamKey = callArgs.data['streamKey'] as string;
      // Regressione: streamKey == creatorId collideva sul vincolo @unique al
      // secondo Go Live della stessa creator (P2002 → 500).
      expect(streamKey).not.toBe(CREATOR_ID);
      expect(streamKey).toMatch(/^lk_/);
    });

    it('closes any orphaned LIVE session for the creator before opening a new one', async () => {
      await service.createIngestSession(mockActor);

      expect(mockPrisma.streamSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { creatorId: CREATOR_ID, status: StreamStatus.LIVE },
          data: expect.objectContaining({ status: StreamStatus.ENDED }),
        }),
      );
    });

    it('throws NotFoundException when no creator found', async () => {
      mockPrisma.creator.findUnique.mockResolvedValue(null);
      mockPrisma.creator.findFirst.mockResolvedValue(null);

      await expect(service.createIngestSession(mockActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does NOT include fanoutTargets in session data (no fan-out in this step)', async () => {
      await service.createIngestSession(mockActor);

      const callArgs = mockPrisma.streamSession.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(callArgs.data['fanoutTargets']).toBeUndefined();
    });
  });

  // ── stopIngestSession ────────────────────────────────────────────────────────

  describe('stopIngestSession', () => {
    it('marks session as ENDED', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        status: StreamStatus.LIVE,
        agencyId: AGENCY_ID,
      });
      mockPrisma.streamSession.update.mockResolvedValue({
        id: SESSION_ID,
        status: StreamStatus.ENDED,
        agencyId: AGENCY_ID,
      });

      const result = await service.stopIngestSession(SESSION_ID, mockActor);

      expect(result.status).toBe(StreamStatus.ENDED);
      expect(mockPrisma.streamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SESSION_ID },
          data: expect.objectContaining({ status: StreamStatus.ENDED }),
        }),
      );
    });

    it('throws NotFoundException when session does not exist in agency', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue(null);

      await expect(
        service.stopIngestSession('non-existent', mockActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears the scene state when the session is stopped', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({
        id: SESSION_ID,
        status: StreamStatus.LIVE,
        agencyId: AGENCY_ID,
      });
      mockPrisma.streamSession.update.mockResolvedValue({
        id: SESSION_ID,
        status: StreamStatus.ENDED,
        agencyId: AGENCY_ID,
      });

      await service.stopIngestSession(SESSION_ID, mockActor);

      expect(mockSceneState.clear).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  // ── scene (overlay) ──────────────────────────────────────────────────────────

  describe('getScene / updateScene', () => {
    const overlays = [
      { id: 'o1', type: 'text', x: 10, y: 10, width: 30, visible: true, text: 'Ciao' },
    ];

    it('getScene returns the scene for a session in the agency', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.get.mockReturnValue({ sessionId: SESSION_ID, overlays: [], updatedAt: 'x' });

      const res = await service.getScene(SESSION_ID, mockActor);

      expect(mockSceneState.get).toHaveBeenCalledWith(SESSION_ID);
      expect(res.sessionId).toBe(SESSION_ID);
    });

    // Senza questa propagazione le scritte resterebbero solo nella preview
    // dell'operatore: nello stream in onda non comparirebbe nulla.
    it('manda la scena aggiornata alle stanze che usano quella sorgente', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      const saved = { sessionId: SESSION_ID, overlays, updatedAt: 'x' };
      mockSceneState.replace.mockReturnValue(saved);

      await service.updateScene(
        SESSION_ID,
        overlays as never,
        undefined,
        undefined,
        undefined,
        mockActor,
      );

      expect(mockBrowserFarm.applySourceScene).toHaveBeenCalledWith(SESSION_ID, saved);
    });

    it('updateScene replaces overlays for a session in the agency', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.replace.mockReturnValue({
        sessionId: SESSION_ID,
        overlays,
        updatedAt: 'x',
      });

      const res = await service.updateScene(
        SESSION_ID,
        overlays as never,
        undefined,
        undefined,
        undefined,
        mockActor,
      );

      expect(mockSceneState.replace).toHaveBeenCalledWith(
        SESSION_ID,
        overlays,
        undefined,
        undefined,
        undefined,
      );
      expect(res.overlays).toEqual(overlays);
    });

    it('updateScene forwards filters to the scene state', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.replace.mockReturnValue({ sessionId: SESSION_ID, overlays, updatedAt: 'x' });
      const filters = { grayscale: 100, brightness: 110 };

      await service.updateScene(SESSION_ID, overlays as never, filters as never, undefined, undefined, mockActor);

      expect(mockSceneState.replace).toHaveBeenCalledWith(SESSION_ID, overlays, filters, undefined, undefined);
    });

    it('updateScene forwards the AI background to the scene state', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.replace.mockReturnValue({ sessionId: SESSION_ID, overlays, updatedAt: 'x' });
      const background = { mode: 'blur', blur: 16 };

      await service.updateScene(
        SESSION_ID,
        overlays as never,
        undefined,
        background as never,
        undefined,
        mockActor,
      );

      expect(mockSceneState.replace).toHaveBeenCalledWith(
        SESSION_ID,
        overlays,
        undefined,
        background,
        undefined,
      );
    });

    it('updateScene stores and broadcasts effects (beautify)', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.replace.mockReturnValue({ sessionId: SESSION_ID, overlays, updatedAt: 'x' });
      const effects = { beautify: { enabled: true, intensity: 50 } };

      await service.updateScene(
        SESSION_ID,
        overlays as never,
        undefined,
        undefined,
        effects as never,
        mockActor,
      );

      expect(mockSceneState.replace).toHaveBeenCalledWith(
        SESSION_ID,
        overlays,
        undefined,
        undefined,
        effects,
      );
    });

    it('updateScene stores and broadcasts effects (facePrivacy)', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockSceneState.replace.mockReturnValue({ sessionId: SESSION_ID, overlays, updatedAt: 'x' });
      const effects = { facePrivacy: { enabled: true, mode: 'blur' as const, intensity: 60 } };

      await service.updateScene(
        SESSION_ID,
        overlays as never,
        undefined,
        undefined,
        effects as never,
        mockActor,
      );

      expect(mockSceneState.replace).toHaveBeenCalledWith(
        SESSION_ID,
        overlays,
        undefined,
        undefined,
        effects,
      );
    });

    it('updateScene throws NotFound when the session is not in the agency', async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue(null);

      await expect(
        service.updateScene('nope', overlays as never, undefined, undefined, undefined, mockActor),
      ).rejects.toThrow(NotFoundException);
      expect(mockSceneState.replace).not.toHaveBeenCalled();
    });
  });

  // ── getActiveSessions ────────────────────────────────────────────────────────

  describe('getActiveSessions', () => {
    it('returns sessions with viewerToken grant: canSubscribe=true, canPublish=false', async () => {
      const now = new Date();
      mockPrisma.streamSession.findMany.mockResolvedValue([
        {
          id: SESSION_ID,
          creatorId: CREATOR_ID,
          creator: { displayName: 'Luna Star' },
          startedAt: now,
          createdAt: now,
          agencyId: AGENCY_ID,
          streamKey: CREATOR_ID,
          status: StreamStatus.LIVE,
        },
      ]);

      const results = await service.getActiveSessions(mockActor);

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe(SESSION_ID);
      expect(results[0].creatorName).toBe('Luna Star');
      expect(results[0].roomName).toBe(SESSION_ID);
      expect(results[0].wsUrl).toBe('ws://localhost:7880');
      expect(results[0].viewerToken).toBe('mock-livekit-token');
    });

    it('viewer token grant: canSubscribe=true, canPublish=false', async () => {
      const now = new Date();
      mockPrisma.streamSession.findMany.mockResolvedValue([
        {
          id: SESSION_ID,
          creatorId: CREATOR_ID,
          creator: { displayName: 'Luna Star' },
          startedAt: now,
          createdAt: now,
          agencyId: AGENCY_ID,
          streamKey: CREATOR_ID,
          status: StreamStatus.LIVE,
        },
      ]);

      await service.getActiveSessions(mockActor);

      // The second addGrant call is from issueViewerToken
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          roomJoin: true,
          canPublish: false,
          canSubscribe: true,
          room: SESSION_ID,
        }),
      );
    });
  });
  // ── setMirror ────────────────────────────────────────────────────────────────

  describe(`setMirror`, () => {
    // Il ribaltamento NON deve mai finire sul device della creator: lì costa una
    // ricodifica per frame. Il service registra la scelta e la propaga a valle.
    it(`salva la scelta e la propaga alle stanze che usano quella sorgente`, async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue({ id: SESSION_ID });
      mockPrisma.streamSession.update.mockResolvedValue({ id: SESSION_ID, mirrored: true });

      const res = await service.setMirror(mockActor, SESSION_ID, true);

      expect(res).toEqual({ mirrored: true });
      expect(mockPrisma.streamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mirrored: true } }),
      );
      expect(mockBrowserFarm.applySourceMirror).toHaveBeenCalledWith(SESSION_ID, true);
    });

    it(`rifiuta una sessione di un'altra agenzia`, async () => {
      mockPrisma.streamSession.findFirst.mockResolvedValue(null);

      await expect(service.setMirror(mockActor, SESSION_ID, true)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockBrowserFarm.applySourceMirror).not.toHaveBeenCalled();
    });
  });
});
