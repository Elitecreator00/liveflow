import { SceneStateService } from './scene-state.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OverlayDto } from './dto/scene.dto';

const SESSION_ID = 'session-1';
const overlays: OverlayDto[] = [
  { id: 'o1', type: 'text', x: 5, y: 5, width: 40, visible: true, text: 'Live' },
];

describe('SceneStateService', () => {
  let service: SceneStateService;
  let gateway: { emitSceneUpdate: jest.Mock };

  beforeEach(() => {
    gateway = { emitSceneUpdate: jest.fn() };
    service = new SceneStateService(gateway as unknown as RealtimeGateway);
  });

  it('returns an empty scene when none was set', () => {
    const state = service.get(SESSION_ID);
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.overlays).toEqual([]);
  });

  it('replace stores overlays and returns them on get', () => {
    service.replace(SESSION_ID, overlays);
    expect(service.get(SESSION_ID).overlays).toEqual(overlays);
  });

  it('replace broadcasts the scene update to session subscribers', () => {
    service.replace(SESSION_ID, overlays);
    expect(gateway.emitSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, overlays }),
    );
  });

  it('replace stores and broadcasts the AI background', () => {
    const background = { mode: 'blur' as const, blur: 14 };
    service.replace(SESSION_ID, overlays, undefined, background);
    expect(service.get(SESSION_ID).background).toEqual(background);
    expect(gateway.emitSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, background }),
    );
  });

  it('replace() stores and broadcasts effects (beautify)', () => {
    const effects = { beautify: { enabled: true, intensity: 50 } };
    service.replace(SESSION_ID, overlays, undefined, undefined, effects as never);
    expect(service.get(SESSION_ID).effects).toEqual(effects);
    expect(gateway.emitSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, effects }),
    );
  });

  it('replace() stores and broadcasts effects (facePrivacy)', () => {
    const effects = { facePrivacy: { enabled: true, mode: 'pixelate' as const, intensity: 40 } };
    service.replace(SESSION_ID, overlays, undefined, undefined, effects as never);
    expect(service.get(SESSION_ID).effects).toEqual(effects);
    expect(gateway.emitSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, effects }),
    );
  });

  it('effects absent → undefined in stored state (retrocompatibilità)', () => {
    service.replace(SESSION_ID, overlays, undefined, undefined, undefined);
    expect(service.get(SESSION_ID).effects).toBeUndefined();
  });

  it('clear removes the stored scene', () => {
    service.replace(SESSION_ID, overlays);
    service.clear(SESSION_ID);
    expect(service.get(SESSION_ID).overlays).toEqual([]);
  });

  it('isolates state per session', () => {
    service.replace('a', overlays);
    expect(service.get('b').overlays).toEqual([]);
  });
});
