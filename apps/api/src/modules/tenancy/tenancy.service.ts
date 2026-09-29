import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Agency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAgencyDto } from './dto/create-agency.dto';

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  async createAgency(dto: CreateAgencyDto): Promise<Agency> {
    const existing = await this.prisma.agency.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException('Agency slug already in use');

    return this.prisma.agency.create({ data: dto });
  }

  async findAgencyById(id: string): Promise<Agency> {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundException(`Agency ${id} not found`);
    return agency;
  }

  async listAgencies(): Promise<Agency[]> {
    return this.prisma.agency.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
