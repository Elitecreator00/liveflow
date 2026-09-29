import { Module } from '@nestjs/common';
import { BrowserFarmService } from './browser-farm.service';
import { BrowserFarmController } from './browser-farm.controller';
import { OrchestratorService } from './orchestrator.service';
import { FingerprintService } from './fingerprint.service';
import { CryptoModule } from '../crypto/crypto.module';
import { RbacModule } from '../rbac/rbac.module';
import { SceneStateModule } from '../studio/scene-state.module';

@Module({
  imports: [CryptoModule, RbacModule, SceneStateModule],
  providers: [BrowserFarmService, OrchestratorService, FingerprintService],
  controllers: [BrowserFarmController],
  exports: [BrowserFarmService],
})
export class BrowserFarmModule {}
