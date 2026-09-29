import { Injectable, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCreatorDto } from './dto/create-creator.dto';

export interface CreatorListItem {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  platforms: Array<{
    platform: string;
    platformUsername: string;
    isActive: boolean;
  }>;
}

export interface CreatorResponse {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
}

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(agencyId: string, dto: CreateCreatorDto): Promise<CreatorResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
          role: Role.CREATOR,
          agencyId,
        },
      });

      const creator = await tx.creator.create({
        data: {
          displayName: dto.displayName,
          agencyId,
          userId: user.id,
        },
      });

      return { creator, userEmail: user.email, userCreatedAt: user.createdAt };
    });

    return {
      id: result.creator.id,
      displayName: result.creator.displayName,
      email: result.userEmail,
      createdAt: result.userCreatedAt,
    };
  }

  async list(agencyId: string): Promise<CreatorListItem[]> {
    const creators = await this.prisma.creator.findMany({
      where: { agencyId },
      include: {
        user: { select: { email: true, createdAt: true } },
        connectedAccounts: {
          select: { platform: true, platformUsername: true, isActive: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return creators.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      email: c.user?.email ?? '',
      createdAt: c.user?.createdAt ?? c.createdAt,
      platforms: c.connectedAccounts.map((a) => ({
        platform: a.platform,
        platformUsername: a.platformUsername,
        isActive: a.isActive,
      })),
    }));
  }

  async delete(agencyId: string, creatorId: string): Promise<void> {
    await this.prisma.creator.deleteMany({ where: { id: creatorId, agencyId } });
  }
}
