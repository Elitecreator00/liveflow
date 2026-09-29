import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  OverlayDto,
  SceneBackgroundDto,
  SceneEffectsDto,
  SceneFiltersDto,
  SceneState,
} from './dto/scene.dto';

/**
 * Stato scena (overlay) per sessione di ingest.
 *
 * TODO ADR-0004: lo stato va spostato in Redis (`SceneStateService` Redis-backed)
 * per supportare più istanze API e la pagina scena renderizzata da LiveKit Egress.
 * Per ora è IN-MEMORY (single-node dev): sufficiente per l'editor operatore e il
 * broadcast live ai subscriber della sessione.
 */
@Injectable()
export class SceneStateService {
  private readonly scenes = new Map<string, SceneState>();

  constructor(private readonly realtime: RealtimeGateway) {}

  /** Stato corrente della scena; scena vuota se mai impostata. */
  get(sessionId: string): SceneState {
    return (
      this.scenes.get(sessionId) ?? {
        sessionId,
        overlays: [],
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  /** Sostituisce overlay + filtri + sfondo + effetti e notifica i subscriber via WebSocket. */
  replace(
    sessionId: string,
    overlays: OverlayDto[],
    filters?: SceneFiltersDto,
    background?: SceneBackgroundDto,
    effects?: SceneEffectsDto,
  ): SceneState {
    const state: SceneState = {
      sessionId,
      overlays,
      filters,
      background,
      effects,
      updatedAt: new Date().toISOString(),
    };
    this.scenes.set(sessionId, state);
    this.realtime.emitSceneUpdate({
      sessionId,
      overlays,
      filters,
      background,
      effects,
      updatedAt: state.updatedAt,
    });
    return state;
  }

  /** Rimuove lo stato della scena (es. a sessione terminata). */
  clear(sessionId: string): void {
    this.scenes.delete(sessionId);
  }
}
