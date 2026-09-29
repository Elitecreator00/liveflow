import { NotFoundException } from '@nestjs/common';

const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('livekit-server-sdk', () => ({
  EgressClient: jest.fn().mockImplementation(() => ({
    startRoomCompositeEgress: mockStart,
    stopEgress: mockStop,
  })),
  StreamOutput: jest.fn().mockImplementation((o: unknown) => o),
  StreamProtocol: { RTMP: 1 },
}));

import { EgressOrchestrator } from './egress.orchestrator';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

const prisma = { streamSession: { findFirst: jest.fn() } };
const config = {
  get: jest.fn((k: string) =>
    ({
      LIVEKIT_URL: 'ws://localhost:7880',
      SCENE_RENDER_BASE_URL: 'http://host:3000',
      COMPOSITE_RTMP_BASE: 'rtmp://host:1935/composite',
    } as Record<string, string>)[k],
  ),
  getOrThrow: jest.fn((k: string) =>
    ({ LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' } as Record<string, string>)[k],
  ),
};

describe('EgressOrchestrator', () => {
  let svc: EgressOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.streamSession.findFirst.mockResolvedValue({ id: 'sess-1' });
    mockStart.mockResolvedValue({ egressId: 'eg-1' });
    mockStop.mockResolvedValue({});
    svc = new EgressOrchestrator(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('starts a room composite egress on the scene page + composite RTMP', async () => {
    const res = await svc.startSceneRender('sess-1', 'agency-1');
    expect(res.egressId).toBe('eg-1');
    expect(res.rtmpUrl).toBe('rtmp://host:1935/composite/sess-1');
    expect(mockStart).toHaveBeenCalledWith(
      'sess-1',
      expect.anything(),
      expect.objectContaining({ customBaseUrl: 'http://host:3000/scene/sess-1' }),
    );
    expect(svc.isRendering('sess-1')).toBe(true);
  });

  it('is idempotent per session', async () => {
    await svc.startSceneRender('sess-1', 'agency-1');
    await svc.startSceneRender('sess-1', 'agency-1');
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('stops the egress and clears active state', async () => {
    await svc.startSceneRender('sess-1', 'agency-1');
    const r = await svc.stopSceneRender('sess-1', 'agency-1');
    expect(mockStop).toHaveBeenCalledWith('eg-1');
    expect(r.stopped).toBe(true);
    expect(svc.isRendering('sess-1')).toBe(false);
  });

  it('throws NotFound when the session is not in the agency', async () => {
    prisma.streamSession.findFirst.mockResolvedValue(null);
    await expect(svc.startSceneRender('x', 'agency-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('stopInternal stops without tenant check', async () => {
    await svc.startSceneRender('sess-1', 'agency-1');
    await svc.stopInternal('sess-1');
    expect(mockStop).toHaveBeenCalledWith('eg-1');
    expect(svc.isRendering('sess-1')).toBe(false);
  });

  it('stopSceneRender returns stopped:false when nothing is rendering', async () => {
    const r = await svc.stopSceneRender('sess-1', 'agency-1');
    expect(r.stopped).toBe(false);
    expect(mockStop).not.toHaveBeenCalled();
  });
});
