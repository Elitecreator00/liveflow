import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlatformsService } from './platforms.service';
import { ConnectAccountDto } from './dto/connect-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenancy/guards/tenant.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/roles.enum';

/**
 * PlatformsController — manages ConnectedAccount CRUD.
 *
 * POST   /agencies/:agencyId/creators/:creatorId/accounts
 *   Encrypts the streamKey with CryptoService and persists the account.
 *
 * GET    /agencies/:agencyId/creators/:creatorId/accounts
 *   Lists accounts without exposing the encrypted stream key.
 */
@Controller('agencies/:agencyId/creators/:creatorId/accounts')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class PlatformsController {
  constructor(private readonly platforms: PlatformsService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  connectAccount(
    @Param('agencyId') agencyId: string,
    @Param('creatorId') creatorId: string,
    @Body() dto: ConnectAccountDto,
  ) {
    return this.platforms.connectAccount(agencyId, creatorId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  listAccounts(
    @Param('agencyId') agencyId: string,
    @Param('creatorId') creatorId: string,
  ) {
    return this.platforms.listConnectedAccounts(creatorId, agencyId);
  }
}
