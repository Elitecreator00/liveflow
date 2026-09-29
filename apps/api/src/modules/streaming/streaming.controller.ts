import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { StreamingService, GoLiveResponse } from './streaming.service';
import { GoLiveDto } from './dto/go-live.dto';
import { MediaMtxAuthDto } from './dto/mediamtx-auth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenancy/guards/tenant.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/roles.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StreamSession } from '@prisma/client';

@Controller()
export class StreamingController {
  private readonly logger = new Logger(StreamingController.name);

  constructor(private readonly streaming: StreamingService) {}

  // ── User-facing routes (RBAC-protected) ───────────────────────

  @Post('agencies/:agencyId/streaming/go-live')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  goLive(
    @Body() dto: GoLiveDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GoLiveResponse> {
    return this.streaming.goLive(dto, user);
  }

  @Post('agencies/:agencyId/streaming/sessions/:sessionId/stop')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  @HttpCode(HttpStatus.OK)
  stopLive(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamSession> {
    return this.streaming.stopLive(sessionId, user);
  }

  // ── MediaMTX external authentication endpoint (ADR-0003) ───────
  //
  // MediaMTX calls POST /streaming/auth for every publisher connection.
  // The path field is "live/<jwt>" where <jwt> is the JWT stream key.
  //
  // Configuration in mediamtx.dev.yml:
  //   externalAuthenticationURL: http://localhost:3001/streaming/auth
  //
  // Responds 2xx (200) when valid, throws 401 when invalid/expired.
  // This endpoint is intentionally NOT protected by JwtAuthGuard — it is
  // called by MediaMTX internally, not by end users.
  @Post('streaming/auth')
  @HttpCode(HttpStatus.OK)
  // MediaMTX invia campi variabili (incl. `token` in v1.18+). NON usiamo
  // forbidNonWhitelisted qui: i campi extra vengono ignorati, non rifiutati,
  // altrimenti l'auth fallirebbe con 400 (MediaMTX la interpreta come deny).
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  async authenticateStream(@Body() dto: MediaMtxAuthDto): Promise<{ ok: true }> {
    this.logger.debug(`MediaMTX auth request: path=${dto.path} action=${dto.action}`);

    // api/metrics/pprof actions don't carry stream keys — allow them through
    const nonStreamActions = ['api', 'metrics', 'pprof'];
    if (dto.action && nonStreamActions.includes(dto.action)) {
      return { ok: true };
    }

    const valid = await this.streaming.validateStreamKey(dto.path);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired stream key');
    }
    return { ok: true };
  }
}
