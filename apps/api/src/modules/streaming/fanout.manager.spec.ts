import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FanoutStatus, StreamStatus, Platform } from '@prisma/client';
import { FanoutManager } from './fanout.manager';
import { FFMPEG_RUNNER_TOKEN } from './interfaces/ffmpeg-runner.interface';
import { PrismaService } from '../../prisma/prisma.service';
import type { IFfmpegRunner, FfmpegProcess, FfmpegLaunchOptions } from './interfaces/ffmpeg-runner.interface';

// ── Mock ffmpeg runner ─────────────────────────────────────────────

class MockFfmpegProcess implements FfmpegProcess {
  private _alive = true;
  killCalled = false;

  constructor(readonly targetId: string) {}

  get isAlive(): boolean { return this._alive; }

  kill(): void {
    this._alive = false;
    this.killCalled = true;
  }
}

const createMockRunner = () => {
  const processes = new Map<string, MockFfmpegProcess>();
  const launchCallbacks = new Map<string, FfmpegLaunchOptions>();

  const runner: IFfmpegRunner = {
    launch: jest.fn((opts: FfmpegLaunchOptions): FfmpegProcess => {
      const proc = new MockFfmpegProcess(opts.targetId);
      processes.set(opts.targetId, proc);
      launchCallbacks.set(opts.targetId, opts);
      return proc;
    }),
  };

  return { runner, processes, launchCallbacks };
};

// ── Fixtures ──────────────────────────────────────────────────────

const SESSION_ID = 'session-1';
const SESSION_ID_2 = 'session-2';
const TARGET_1_ID = 'target-1';
const TARGET_2_ID = 'target-2';
const TARGET_3_ID = 'target-3'; // belongs to SESSION_ID_2

// Real platform RTMP endpoints from platform-registry.ts
const STRIPCHAT_BASE = 'rtmp://live.doppiocdn.com/ext';
const MFC_BASE = 'rtmp://publish.myfreecams.com/NxServer';
const CB_BASE = 'rtmp://live.chaturbate.com/live';

const mockSession = {
  id: SESSION_ID,
  streamKey: 'jwt.stream.key',
  status: StreamStatus.LIVE,
  agencyId: 'agency-1',
  creatorId: 'creator-1',
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  fanoutTargets: [
    {
      id: TARGET_1_ID,
      platform: Platform.CHATURBATE,
      rtmpUrl: CB_BASE,
      streamKey: 'cb_token_abc',
      status: FanoutStatus.PENDING,
      sessionId: SESSION_ID,
      connectedAccountId: 'acct-1',
      lastError: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: TARGET_2_ID,
      platform: Platform.STRIPCHAT,
      rtmpUrl: STRIPCHAT_BASE,
      streamKey: 'sc_token_xyz',
      status: FanoutStatus.PENDING,
      sessionId: SESSION_ID,
      connectedAccountId: 'acct-2',
      lastError: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

const mockSession2 = {
  id: SESSION_ID_2,
  streamKey: 'jwt.stream.key.2',
  status: StreamStatus.LIVE,
  agencyId: 'agency-1',
  creatorId: 'creator-2',
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  fanoutTargets: [
    {
      id: TARGET_3_ID,
      platform: Platform.MYFREECAMS,
      rtmpUrl: MFC_BASE,
      streamKey: 'mfc_token_999',
      status: FanoutStatus.PENDING,
      sessionId: SESSION_ID_2,
      connectedAccountId: 'acct-3',
      lastError: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────

describe('FanoutManager', () => {
  let manager: FanoutManager;
  let mockRunner: ReturnType<typeof createMockRunner>;
  const mockPrisma = {
    streamSession: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockSession),
    },
    fanoutTarget: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const mockConfig = {
    get: jest.fn().mockReturnValue('rtmp://localhost:1935'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRunner = createMockRunner();
    mockPrisma.streamSession.findUniqueOrThrow.mockResolvedValue(mockSession);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanoutManager,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: FFMPEG_RUNNER_TOKEN, useValue: mockRunner.runner },
      ],
    }).compile();

    manager = module.get<FanoutManager>(FanoutManager);
  });

  describe('startSession', () => {
    it('should launch one independent ffmpeg process per fanout target', async () => {
      await manager.startSession(SESSION_ID);

      expect(mockRunner.runner.launch).toHaveBeenCalledTimes(2);

      const calls = (mockRunner.runner.launch as jest.Mock).mock.calls as FfmpegLaunchOptions[][];
      const targetIds = calls.map((c) => c[0]?.targetId);
      expect(targetIds).toContain(TARGET_1_ID);
      expect(targetIds).toContain(TARGET_2_ID);
    });

    it('should build correct source URL from stream key', async () => {
      await manager.startSession(SESSION_ID);

      const calls = (mockRunner.runner.launch as jest.Mock).mock.calls as FfmpegLaunchOptions[][];
      const sourceUrls = calls.map((c) => c[0]?.sourceUrl);
      expect(sourceUrls[0]).toBe('rtmp://localhost:1935/live/jwt.stream.key');
    });

    it('should build correct destinationUrl using platform registry base + stream key', async () => {
      await manager.startSession(SESSION_ID);

      const calls = (mockRunner.runner.launch as jest.Mock).mock.calls as FfmpegLaunchOptions[][];
      const byTarget = Object.fromEntries(
        calls.map((c) => [c[0]?.targetId, c[0]?.destinationUrl]),
      );
      // Chaturbate target: CB_BASE/cb_token_abc
      expect(byTarget[TARGET_1_ID]).toBe(`${CB_BASE}/cb_token_abc`);
      // Stripchat target: STRIPCHAT_BASE/sc_token_xyz
      expect(byTarget[TARGET_2_ID]).toBe(`${STRIPCHAT_BASE}/sc_token_xyz`);
    });

    it('processes for different targets must be independent instances', async () => {
      await manager.startSession(SESSION_ID);

      const proc1 = mockRunner.processes.get(TARGET_1_ID);
      const proc2 = mockRunner.processes.get(TARGET_2_ID);

      expect(proc1).toBeDefined();
      expect(proc2).toBeDefined();
      expect(proc1).not.toBe(proc2);
    });
  });

  describe('stopTarget — per-target isolation (ADR-0002)', () => {
    it('should kill only the target process, leaving others running', async () => {
      await manager.startSession(SESSION_ID);

      manager.stopTarget(TARGET_1_ID);

      const proc1 = mockRunner.processes.get(TARGET_1_ID);
      const proc2 = mockRunner.processes.get(TARGET_2_ID);

      expect(proc1?.killCalled).toBe(true);
      // proc2 must NOT be killed — this is the core isolation guarantee
      expect(proc2?.killCalled).toBe(false);
    });

    it('should update target status to STOPPED in DB', async () => {
      await manager.startSession(SESSION_ID);
      manager.stopTarget(TARGET_1_ID);

      // Wait for async DB update
      await Promise.resolve();

      expect(mockPrisma.fanoutTarget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_1_ID },
          data: expect.objectContaining({ status: FanoutStatus.STOPPED }),
        }),
      );
    });
  });

  describe('stopSession — session-scoped isolation', () => {
    it('should stop all targets of the session without affecting other sessions', async () => {
      // Start session 1 (2 targets)
      await manager.startSession(SESSION_ID);

      // Start session 2 (1 target) using a different mock session
      mockPrisma.streamSession.findUniqueOrThrow.mockResolvedValueOnce(mockSession2);
      await manager.startSession(SESSION_ID_2);

      const proc1 = mockRunner.processes.get(TARGET_1_ID);
      const proc2 = mockRunner.processes.get(TARGET_2_ID);
      const proc3 = mockRunner.processes.get(TARGET_3_ID);

      expect(proc1).toBeDefined();
      expect(proc2).toBeDefined();
      expect(proc3).toBeDefined();

      // Stop only session 1
      manager.stopSession(SESSION_ID);

      expect(proc1?.killCalled).toBe(true);
      expect(proc2?.killCalled).toBe(true);
      // Session 2 target must remain alive
      expect(proc3?.killCalled).toBe(false);
    });
  });

  describe('reconnect on process exit', () => {
    it('should attempt reconnect when process exits with non-zero code', async () => {
      jest.useFakeTimers();
      await manager.startSession(SESSION_ID);

      const opts = mockRunner.launchCallbacks.get(TARGET_1_ID);
      expect(opts).toBeDefined();

      // Simulate unexpected exit (non-zero)
      opts?.onExit(1, null);

      // Advance past reconnect delay
      jest.advanceTimersByTime(6_000);

      // Should have relaunched: total calls = 2 initial + 1 reconnect
      expect(mockRunner.runner.launch).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('should NOT reconnect when process exits cleanly (code 0)', async () => {
      jest.useFakeTimers();
      await manager.startSession(SESSION_ID);

      const opts = mockRunner.launchCallbacks.get(TARGET_1_ID);
      opts?.onExit(0, null);

      jest.advanceTimersByTime(6_000);

      // 2 initial launches, no extra
      expect(mockRunner.runner.launch).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });
});
