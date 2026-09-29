import { Module } from '@nestjs/common';
import { SceneStateService } from './scene-state.service';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Stato-scena isolato in un modulo proprio: lo usano sia lo Studio (che lo
 * modifica) sia la farm multi-browser (che lo compone nella sorgente). Tenerlo
 * dentro StudioModule creerebbe un ciclo, visto che lo Studio a sua volta
 * dipende dalla farm per propagare le modifiche.
 */
@Module({
  imports: [RealtimeModule],
  providers: [SceneStateService],
  exports: [SceneStateService],
})
export class SceneStateModule {}
