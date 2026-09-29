import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface AuthTokens {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role,
        agencyId: dto.agencyId,
      },
    });

    return this.signTokens(user.id, user.email, user.role, user.agencyId);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) throw new UnauthorizedException('Invalid credentials');

    return this.signTokens(user.id, user.email, user.role, user.agencyId);
  }

  private signTokens(
    userId: string,
    email: string,
    role: string,
    agencyId: string,
  ): AuthTokens {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role: role as JwtPayload['role'],
      agencyId,
    };

    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    const ttl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';

    const accessToken = this.jwt.sign(payload, {
      secret,
      expiresIn: ttl,
    });

    return { accessToken };
  }
}
