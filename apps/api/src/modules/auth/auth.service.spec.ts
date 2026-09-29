import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

// ── Fixtures ──────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hashed_password',
  displayName: 'Test User',
  role: Role.MANAGER,
  agencyId: 'agency-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, string> = {
      JWT_ACCESS_SECRET: 'test-secret',
      JWT_ACCESS_TTL: '15m',
    };
    return map[key];
  }),
};

// ── Tests ─────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'password123',
      displayName: 'New User',
      role: Role.MANAGER,
      agencyId: 'agency-1',
    };

    it('should create a user and return an access token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...MOCK_USER, email: dto.email });

      const result = await service.register(dto);

      expect(result).toHaveProperty('accessToken', 'mock.jwt.token');
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: dto.email }),
        }),
      );
    });

    it('should hash the password before storing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...MOCK_USER, email: dto.email });

      await service.register(dto);

      const createCall = mockPrisma.user.create.mock.calls[0] as [{ data: Record<string, unknown> }][];
      const storedHash = (createCall[0] as { data: Record<string, unknown> }).data['passwordHash'] as string;
      expect(storedHash).not.toBe(dto.password);
      // Verify it is a valid argon2 hash (starts with $argon2)
      expect(storedHash).toMatch(/^\$argon2/);
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      const realHash = await argon2.hash('correct_password');
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordHash: realHash,
      });

      const result = await service.login({
        email: MOCK_USER.email,
        password: 'correct_password',
      });

      expect(result).toHaveProperty('accessToken', 'mock.jwt.token');
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const realHash = await argon2.hash('correct_password');
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordHash: realHash,
      });

      await expect(
        service.login({ email: MOCK_USER.email, password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
