import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { PlatformsService } from './platforms.service';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';

// ── Fixtures ──────────────────────────────────────────────────────

const VALID_HEX_KEY = 'b'.repeat(64); // 32-byte test key

const AGENCY_ID = 'agency-1';
const CREATOR_ID = 'creator-1';
const ACCOUNT_ID = 'acct-1';
const PLAIN_STREAM_KEY = 'live_abc123XYZ_platformkey';

// ── Mocks ─────────────────────────────────────────────────────────

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue(VALID_HEX_KEY),
};

const mockPrisma = {
  connectedAccount: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

async function buildModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PlatformsService,
      CryptoService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ConfigService, useValue: mockConfig },
    ],
  }).compile();

  return {
    service: module.get<PlatformsService>(PlatformsService),
    crypto: module.get<CryptoService>(CryptoService),
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('PlatformsService — connectAccount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should encrypt the stream key before persisting', async () => {
    const { service } = await buildModule();

    mockPrisma.connectedAccount.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: ACCOUNT_ID, ...data }),
    );

    await service.connectAccount(AGENCY_ID, CREATOR_ID, {
      platform: Platform.STRIPCHAT,
      platformUsername: 'testuser',
      streamKey: PLAIN_STREAM_KEY,
    });

    const createArg = mockPrisma.connectedAccount.create.mock.calls[0][0] as {
      data: { encryptedCreds: string; streamKey?: string };
    };

    // encryptedCreds must NOT be the raw key
    expect(createArg.data.encryptedCreds).not.toBe(PLAIN_STREAM_KEY);
    // And it must not be present as plain text in any field
    expect(JSON.stringify(createArg.data)).not.toContain(PLAIN_STREAM_KEY);
    // Must be valid base64
    expect(() => Buffer.from(createArg.data.encryptedCreds, 'base64')).not.toThrow();
  });

  it('should decrypt encryptedCreds back to the original stream key', async () => {
    const { service, crypto } = await buildModule();

    mockPrisma.connectedAccount.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: ACCOUNT_ID, ...data }),
    );

    await service.connectAccount(AGENCY_ID, CREATOR_ID, {
      platform: Platform.CHATURBATE,
      platformUsername: 'cbuser',
      streamKey: PLAIN_STREAM_KEY,
    });

    const createArg = mockPrisma.connectedAccount.create.mock.calls[0][0] as {
      data: { encryptedCreds: string };
    };

    const decrypted = crypto.decrypt(createArg.data.encryptedCreds);
    expect(decrypted).toBe(PLAIN_STREAM_KEY);
  });
});

describe('PlatformsService — listConnectedAccounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should omit encryptedCreds from returned accounts', async () => {
    const { service, crypto } = await buildModule();

    const encryptedCreds = crypto.encrypt(PLAIN_STREAM_KEY);
    mockPrisma.connectedAccount.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        platform: Platform.STRIPCHAT,
        encryptedCreds,
        platformUsername: 'testuser',
        isActive: true,
        agencyId: AGENCY_ID,
        creatorId: CREATOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const accounts = await service.listConnectedAccounts(CREATOR_ID, AGENCY_ID);

    expect(accounts).toHaveLength(1);
    // encryptedCreds must not appear in the response
    expect('encryptedCreds' in accounts[0]).toBe(false);
    // The raw stream key must not appear anywhere
    expect(JSON.stringify(accounts[0])).not.toContain(PLAIN_STREAM_KEY);
    // But safe fields should be present
    expect(accounts[0]).toMatchObject({ id: ACCOUNT_ID, platform: Platform.STRIPCHAT });
  });
});

describe('PlatformsService — resolveRtmpTarget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should decrypt and build correct push URL for Stripchat', async () => {
    const { service, crypto } = await buildModule();

    const encryptedCreds = crypto.encrypt(PLAIN_STREAM_KEY);
    const account = {
      id: ACCOUNT_ID,
      platform: Platform.STRIPCHAT,
      encryptedCreds,
      platformUsername: 'testuser',
      isActive: true,
      agencyId: AGENCY_ID,
      creatorId: CREATOR_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const resolved = service.resolveRtmpTarget(account as Parameters<typeof service.resolveRtmpTarget>[0]);

    expect(resolved.streamKey).toBe(PLAIN_STREAM_KEY);
    expect(resolved.pushUrl).toBe(`rtmp://live.doppiocdn.com/ext/${PLAIN_STREAM_KEY}`);
    expect(resolved.rtmpConfig.requiresRtmps).toBe(false);
  });

  it('should decrypt and build correct push URL for MyFreeCams', async () => {
    const { service, crypto } = await buildModule();

    const encryptedCreds = crypto.encrypt(PLAIN_STREAM_KEY);
    const account = {
      id: ACCOUNT_ID,
      platform: Platform.MYFREECAMS,
      encryptedCreds,
      platformUsername: 'mfcuser',
      isActive: true,
      agencyId: AGENCY_ID,
      creatorId: CREATOR_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const resolved = service.resolveRtmpTarget(account as Parameters<typeof service.resolveRtmpTarget>[0]);

    expect(resolved.streamKey).toBe(PLAIN_STREAM_KEY);
    expect(resolved.pushUrl).toBe(`rtmp://publish.myfreecams.com/NxServer/${PLAIN_STREAM_KEY}`);
  });
});
