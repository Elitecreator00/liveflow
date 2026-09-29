import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { StreamingService } from './streaming.service';
import { StreamingController } from './streaming.controller';
import { FanoutManager } from './fanout.manager';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformsService } from '../platforms/platforms.service';

// ── Fixtures ──────────────────────────────────────────────────────

const STREAM_KEY_SECRET = 'test_stream_key_secret_min_32_chars_padded!!!';

// ── Mocks ─────────────────────────────────────────────────────────

const mockPrisma = {
  streamSession: { findFirst: jest.fn(), update: jest.fn() },
  connectedAccount: { findMany: jest.fn() },
  creator: { findFirst: jest.fn() },
};

const mockFanout = { startSession: jest.fn(), stopSession: jest.fn() };

const mockPlatforms = { resolveRtmpTarget: jest.fn(), getRtmpConfig: jest.fn() };

const mockConfig = {
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'JWT_STREAM_KEY_SECRET') return STREAM_KEY_SECRET;
    throw new Error(`Unknown key: ${key}`);
  }),
  get: jest.fn().mockReturnValue(undefined),
};

// ── Helper: sign a real JWT with correct purpose ──────────────────

function signStreamKey(jwtService: JwtService, options: { expiresIn?: string; purpose?: string } = {}) {
  return jwtService.sign(
    { sub: 'creator-1', agencyId: 'agency-1', purpose: options.purpose ?? 'stream-key' },
    { secret: STREAM_KEY_SECRET, expiresIn: options.expiresIn ?? '12h' },
  );
}

// ── Tests ─────────────────────────────────────────────────────────

describe('StreamingController — /streaming/auth (MediaMTX JWT auth, ADR-0003)', () => {
  let controller: StreamingController;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamingService,
        StreamingController,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FanoutManager, useValue: mockFanout },
        { provide: PlatformsService, useValue: mockPlatforms },
        { provide: ConfigService, useValue: mockConfig },
        JwtService,
      ],
    }).compile();

    controller = module.get<StreamingController>(StreamingController);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should return { ok: true } for a valid JWT stream key in path live/<jwt>', async () => {
    const jwt = signStreamKey(jwtService);
    const result = await controller.authenticateStream({ path: `live/${jwt}` });
    expect(result).toEqual({ ok: true });
  });

  it('should throw UnauthorizedException for an invalid (garbage) token', async () => {
    await expect(
      controller.authenticateStream({ path: 'live/not.a.real.jwt' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for an expired JWT', async () => {
    // Sign a token already expired (1 second TTL, then manually expire it by using -1s)
    const expiredJwt = jwtService.sign(
      { sub: 'creator-1', agencyId: 'agency-1', purpose: 'stream-key' },
      { secret: STREAM_KEY_SECRET, expiresIn: -1 }, // already expired
    );
    await expect(
      controller.authenticateStream({ path: `live/${expiredJwt}` }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for a JWT with wrong purpose', async () => {
    const wrongPurposeJwt = signStreamKey(jwtService, { purpose: 'access' });
    await expect(
      controller.authenticateStream({ path: `live/${wrongPurposeJwt}` }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when path contains no token', async () => {
    await expect(
      controller.authenticateStream({ path: 'live/' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return { ok: true } for api/metrics/pprof actions (bypass)', async () => {
    const result = await controller.authenticateStream({ path: '', action: 'api' });
    expect(result).toEqual({ ok: true });
  });

  it('should return { ok: true } for metrics action without a path', async () => {
    const result = await controller.authenticateStream({ path: '/v3/paths/list', action: 'metrics' });
    expect(result).toEqual({ ok: true });
  });
});
