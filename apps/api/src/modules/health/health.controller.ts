import { Controller, Get, UseGuards } from '@nestjs/common';
import { HealthService, StreamHealthStatus } from './health.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Public liveness probe */
  @Get()
  ping(): { status: string; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /** Authenticated stream health (MediaMTX proxy) */
  @Get('stream')
  @UseGuards(JwtAuthGuard)
  streamHealth(): Promise<StreamHealthStatus> {
    return this.health.getMediaMtxPaths();
  }
}
