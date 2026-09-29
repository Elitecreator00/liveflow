import { Module } from '@nestjs/common';
import { BrowserFarmModule } from '../browser-farm/browser-farm.module';
import { SceneStateModule } from './scene-state.module';
import { StudioService } from './studio.service';
import { AssetsService } from './assets.service';
import { EgressOrchestrator } from './egress.orchestrator';
import { StudioController } from './studio.controller';
import { RbacModule } from '../rbac/rbac.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RbacModule, RealtimeModule, BrowserFarmModule, SceneStateModule],
  providers: [StudioService, AssetsService, EgressOrchestrator],
  controllers: [StudioController],
  exports: [StudioService, SceneStateModule],
})
export class StudioModule {}
