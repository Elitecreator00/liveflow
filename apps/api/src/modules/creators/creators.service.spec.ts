import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { CreatorsService } from './creators.service';
import { PrismaService } from '../../prisma/prisma.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AGENCY_ID = 'agency-1';
const CREATOR_ID = 'creator-1';
const USER_ID = 'user-1';

const MOCK_USER = {
  id: USER_ID,
  email: 'creator@example.com',
  passwordHash: 'hashed',
  displayName: 'Test Creator',
  role: Role.CREATOR,
  agencyId: AGENCY_ID,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const MOCK_CREATOR = {
  id: CREATOR_ID,
  displayName: 'Test Creator',
  agencyId: AGENCY_ID,
  userId: USER_ID,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ── Prisma mock ───────────────────────────────────────────────────────────────

const txMock = {
  user: { create: jest.fn() },
  creator: { create: jest.fn() },
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  creator: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof txMock) => unknown) => cb(txMock)),
};

// ── Module builder ────────────────────────────────────────────────────────────

async function buildModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CreatorsService,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();
  return module.get<CreatorsService>(CreatorsService);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreatorsService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    txMock.user.create.mockResolvedValue(MOCK_USER);
    txMock.creator.create.mockResolvedValue(MOCK_CREATOR);
  });

  it('creates User + Creator in a transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const service = await buildModule();
    const result = await service.create(AGENCY_ID, {
      displayName: 'Test Creator',
      email: 'creator@example.com',
      password: 'password123',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'creator@example.com',
          role: Role.CREATOR,
          agencyId: AGENCY_ID,
        }),
      }),
    );
    expect(txMock.creator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agencyId: AGENCY_ID,
          userId: USER_ID,
        }),
      }),
    );
    expect(result.id).toBe(CREATOR_ID);
    expect(result.email).toBe('creator@example.com');
  });

  it('hashes the password before storing (never stores plain text)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const service = await buildModule();
    await service.create(AGENCY_ID, {
      displayName: 'Creator',
      email: 'creator@example.com',
      password: 'myPlainPassword',
    });

    const userCreateArg = txMock.user.create.mock.calls[0]?.[0] as {
      data: { passwordHash: string };
    };
    expect(userCreateArg.data.passwordHash).not.toBe('myPlainPassword');
    expect(userCreateArg.data.passwordHash).toMatch(/^\$argon2/);
  });

  it('verifies the argon2 hash can round-trip', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const service = await buildModule();
    const password = 'securePass99';
    await service.create(AGENCY_ID, {
      displayName: 'Creator',
      email: 'creator@example.com',
      password,
    });

    const userCreateArg = txMock.user.create.mock.calls[0]?.[0] as {
      data: { passwordHash: string };
    };
    const valid = await argon2.verify(userCreateArg.data.passwordHash, password);
    expect(valid).toBe(true);
  });

  it('never returns passwordHash in response', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const service = await buildModule();
    const result = await service.create(AGENCY_ID, {
      displayName: 'Creator',
      email: 'creator@example.com',
      password: 'password123',
    });

    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('argon2');
  });

  it('throws 409 ConflictException if email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const service = await buildModule();
    await expect(
      service.create(AGENCY_ID, {
        displayName: 'New',
        email: 'creator@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CreatorsService.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns creator list with platform info (no encryptedCreds)', async () => {
    mockPrisma.creator.findMany.mockResolvedValue([
      {
        ...MOCK_CREATOR,
        user: { email: 'creator@example.com', createdAt: new Date('2026-01-01') },
        connectedAccounts: [
          { platform: 'CHATURBATE', platformUsername: 'cbuser', isActive: true },
        ],
      },
    ]);

    const service = await buildModule();
    const result = await service.list(AGENCY_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: CREATOR_ID,
      email: 'creator@example.com',
      platforms: [{ platform: 'CHATURBATE', platformUsername: 'cbuser', isActive: true }],
    });
    expect(JSON.stringify(result)).not.toContain('encryptedCreds');
  });

  it('queries only within the given agencyId', async () => {
    mockPrisma.creator.findMany.mockResolvedValue([]);

    const service = await buildModule();
    await service.list(AGENCY_ID);

    expect(mockPrisma.creator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agencyId: AGENCY_ID } }),
    );
  });
});
