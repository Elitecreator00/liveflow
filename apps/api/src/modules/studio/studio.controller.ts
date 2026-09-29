import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StudioService } from './studio.service';
import { AssetsService } from './assets.service';
import { EgressOrchestrator } from './egress.orchestrator';
import { CreateIngestSessionDto, IngestSessionResponse, ActiveSessionItem } from './dto/ingest-session.dto';
import { SetMirrorDto } from './dto/set-mirror.dto';
import { UpdateSceneDto, SceneState } from './dto/scene.dto';
import { UploadImageDto, UploadImageResponse } from './dto/upload-image.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/roles.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StreamStatus } from '@prisma/client';

@Controller('studio')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly assets: AssetsService,
    private readonly egress: EgressOrchestrator,
  ) {}

  /**
   * POST /studio/ingest-session
   * Creator starts an ingest session. Creates a LiveKit Room and returns
   * wsUrl + creatorToken for the creator to publish via LiveKit SDK.
   * The streamKey JWT (ADR-0003) is no longer returned; LiveKit tokens
   * replace it for ingest auth. ADR-0003 stream keys remain for future
   * SRT/RTMP bridge scenarios (ADR-0004 §Bridge WHIP).
   */
  @Post('ingest-session')
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  createIngestSession(
    @Body() dto: CreateIngestSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IngestSessionResponse> {
    return this.studio.createIngestSession(user, dto.creatorId);
  }

  /**
   * POST /studio/ingest-session/:id/stop
   * Marks the session as ENDED.
   */
  /**
   * POST /studio/ingest-session/:id/mirror
   * Specchio della sorgente: la creator lo attiva dall'app, ma il
   * ribaltamento avviene a valle (vedi StudioService.setMirror).
   */
  @Post('ingest-session/:id/mirror')
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  setMirror(
    @Param('id') id: string,
    @Body() dto: SetMirrorDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ mirrored: boolean }> {
    return this.studio.setMirror(user, id, dto.mirrored);
  }

  @Post('ingest-session/:id/stop')
  @Roles(Role.OWNER, Role.MANAGER, Role.CREATOR)
  @HttpCode(HttpStatus.OK)
  stopIngestSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ sessionId: string; status: StreamStatus }> {
    return this.studio.stopIngestSession(id, user);
  }

  /**
   * GET /studio/active
   * Lists all active ingest sessions (for operator preview wall).
   * Returns wsUrl + viewerToken per session for LiveKit preview.
   */
  @Get('active')
  @Roles(Role.OWNER, Role.MANAGER)
  getActiveSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActiveSessionItem[]> {
    return this.studio.getActiveSessions(user);
  }

  /**
   * GET /studio/sessions/:id/scene — stato corrente della scena (overlay).
   */
  @Get('sessions/:id/scene')
  @Roles(Role.OWNER, Role.MANAGER)
  getScene(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SceneState> {
    return this.studio.getScene(id, user);
  }

  /**
   * PUT /studio/sessions/:id/scene — sostituisce gli overlay; trasmette ai
   * subscriber della sessione via WebSocket (editor live + render Egress).
   */
  @Put('sessions/:id/scene')
  @Roles(Role.OWNER, Role.MANAGER)
  updateScene(
    @Param('id') id: string,
    @Body() dto: UpdateSceneDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SceneState> {
    return this.studio.updateScene(id, dto.overlays, dto.filters, dto.background, dto.effects, user);
  }

  /**
   * POST /studio/uploads — carica un'immagine (data URL base64) come asset
   * dell'agenzia; ritorna l'URL servito staticamente da usare come overlay.
   */
  @Post('uploads')
  @Roles(Role.OWNER, Role.MANAGER)
  uploadImage(
    @Body() dto: UploadImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadImageResponse> {
    return this.assets.saveImageDataUrl(user.agencyId, dto.dataUrl);
  }

  /**
   * POST /studio/sessions/:id/render/start — avvia il render Egress della scena
   * (composito → RTMP → fan-out). Idempotente per sessione.
   */
  @Post('sessions/:id/render/start')
  @Roles(Role.OWNER, Role.MANAGER)
  startRender(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ egressId: string; rtmpUrl: string }> {
    return this.egress.startSceneRender(id, user.agencyId);
  }

  /** POST /studio/sessions/:id/render/stop — ferma il render Egress. */
  @Post('sessions/:id/render/stop')
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(HttpStatus.OK)
  stopRender(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ stopped: boolean }> {
    return this.egress.stopSceneRender(id, user.agencyId);
  }
}
