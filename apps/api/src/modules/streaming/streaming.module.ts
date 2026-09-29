import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StreamingService } from './streaming.service';
import { StreamingController } from './streaming.controller';
import { FanoutManager } from './fanout.manager';
import { ChildProcessFfmpegRunner } from './ffmpeg/child-process-runner';
import { FFMPEG_RUNNER_TOKEN } from './interfaces/ffmpeg-runner.interface';
import { PlatformsModule } from '../platforms/platforms.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    JwtModule.register({}),
    PlatformsModule,
    TenancyModule,
    RbacModule,
  ],
  providers: [
    StreamingService,
    FanoutManager,
    {
      provide: FFMPEG_RUNNER_TOKEN,
      useClass: ChildProcessFfmpegRunner,
    },
  ],
  controllers: [StreamingController],
  exports: [StreamingService, FanoutManager],
})
export class StreamingModule {}
