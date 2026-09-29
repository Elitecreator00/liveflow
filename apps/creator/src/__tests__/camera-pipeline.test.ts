/**
 * CameraPipeline — le proprietà che contano in diretta: si pubblica la camera
 * senza intermediari (nessuna ricodifica sul device), lo specchio tocca solo
 * l'anteprima, la rotazione non lascia al buio e il microfono negato non
 * impedisce di andare live.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CameraPipeline, type CameraPipelineDeps } from "@/lib/camera-pipeline";

// jsdom non ha MediaStream: basta un contenitore di track.
class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

class FakeTrack {
  stopped = false;
  constructor(
    readonly kind: "video" | "audio",
    readonly label = "",
  ) {}
  stop(): void {
    this.stopped = true;
  }
}

/** Deps con un <video> finto: la pipeline non tocca mai il DOM reale. */
function makeDeps(overrides: Partial<CameraPipelineDeps> = {}) {
  const video = {
    autoplay: false,
    muted: false,
    playsInline: false,
    className: "",
    style: {} as Record<string, string>,
    srcObject: null as unknown,
    play: vi.fn().mockResolvedValue(undefined),
  };
  let cameraSerial = 0;
  const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
    cameraSerial += 1;
    const tracks = [new FakeTrack("video", `camera-${cameraSerial}`)];
    if (c.audio) tracks.push(new FakeTrack("audio"));
    return new FakeMediaStream(tracks) as unknown as MediaStream;
  });
  const deps = {
    getUserMedia,
    enumerateDevices: vi.fn().mockResolvedValue([]),
    createElement: (() => video) as never,
    ...overrides,
  } as CameraPipelineDeps;
  return { deps, video, getUserMedia };
}

function makeContainer(): HTMLElement {
  return { replaceChildren: vi.fn() } as unknown as HTMLElement;
}

beforeEach(() => {
  (globalThis as unknown as { MediaStream: unknown }).MediaStream = FakeMediaStream;
});

describe("CameraPipeline — sorgente", () => {
  it("pubblica la camera senza intermediari (nessuna ricodifica sul device)", async () => {
    const { deps } = makeDeps();
    const pipeline = new CameraPipeline(deps);

    const res = await pipeline.start("user");

    expect((res.videoTrack as unknown as FakeTrack).label).toBe("camera-1");
    expect(pipeline.mirrored).toBe(false);
    pipeline.stop();
  });

  it("acquisisce l'audio insieme al video e lo restituisce", async () => {
    const { deps, getUserMedia } = makeDeps();
    const pipeline = new CameraPipeline(deps);

    const res = await pipeline.start("user");

    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: true }));
    expect(res.audioTrack).not.toBeNull();
    expect(res.audioWarning).toBeNull();
    pipeline.stop();
  });

  it("va live senza audio, spiegandolo, se il microfono è negato", async () => {
    const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
      if (c.audio) throw new DOMException("denied", "NotAllowedError");
      return new FakeMediaStream([new FakeTrack("video")]) as unknown as MediaStream;
    });
    const { deps } = makeDeps({ getUserMedia });
    const pipeline = new CameraPipeline(deps);

    const res = await pipeline.start("user");

    expect(res.audioTrack).toBeNull();
    expect(res.audioWarning).toMatch(/senza audio/i);
    expect(res.videoTrack).toBeTruthy(); // la diretta parte comunque
    pipeline.stop();
  });

  it("propaga l'errore se è la camera a essere negata", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { deps } = makeDeps({ getUserMedia });
    const pipeline = new CameraPipeline(deps);

    await expect(pipeline.start("user")).rejects.toThrow();
  });
});

describe("CameraPipeline — specchio", () => {
  it("ribalta l'anteprima senza toccare il track pubblicato", async () => {
    const { deps, video } = makeDeps();
    const pipeline = new CameraPipeline(deps);
    const started = await pipeline.start("user");
    pipeline.attachPreview(makeContainer());

    pipeline.setMirrored(true);

    expect(video.style.transform).toBe("scaleX(-1)");
    expect(pipeline.mirrored).toBe(true);
    // Il video in onda resta lo stesso: il ribaltamento lo applica il server.
    expect((started.videoTrack as unknown as FakeTrack).stopped).toBe(false);

    pipeline.setMirrored(false);
    expect(video.style.transform).toBe("");
    pipeline.stop();
  });

  it("non richiede un'anteprima per essere impostato", async () => {
    const { deps } = makeDeps();
    const pipeline = new CameraPipeline(deps);
    await pipeline.start("user");

    expect(() => pipeline.setMirrored(true)).not.toThrow();
    expect(pipeline.mirrored).toBe(true);
    pipeline.stop();
  });
});

describe("CameraPipeline — rotazione fotocamera", () => {
  it("restituisce il nuovo track della camera e ferma il precedente", async () => {
    const { deps } = makeDeps();
    const pipeline = new CameraPipeline(deps);
    const started = await pipeline.start("user");
    pipeline.attachPreview(makeContainer());

    const { facing, videoTrack } = await pipeline.switchCamera();

    expect(facing).toBe("environment");
    expect(videoTrack).not.toBe(started.videoTrack); // da ripubblicare
    expect((started.videoTrack as unknown as FakeTrack).stopped).toBe(true);
    // L'audio non viene mai toccato dalla rotazione.
    expect((started.audioTrack as unknown as FakeTrack).stopped).toBe(false);
    pipeline.stop();
  });

  it("resta sulla camera attuale se il device non ha l'altra", async () => {
    let calls = 0;
    const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
      calls += 1;
      if (calls > 1) throw new DOMException("no camera", "OverconstrainedError");
      const tracks = [new FakeTrack("video")];
      if (c.audio) tracks.push(new FakeTrack("audio"));
      return new FakeMediaStream(tracks) as unknown as MediaStream;
    });
    const { deps } = makeDeps({ getUserMedia });
    const pipeline = new CameraPipeline(deps);
    await pipeline.start("user");

    await expect(pipeline.switchCamera()).rejects.toThrow();
    expect(pipeline.facing).toBe("user"); // non è rimasta al buio
    pipeline.stop();
  });

  it("mantiene lo specchio dell'anteprima dopo la rotazione", async () => {
    const { deps, video } = makeDeps();
    const pipeline = new CameraPipeline(deps);
    await pipeline.start("user");
    pipeline.attachPreview(makeContainer());
    pipeline.setMirrored(true);

    await pipeline.switchCamera();

    expect(video.style.transform).toBe("scaleX(-1)");
    pipeline.stop();
  });

  it("mostra il pulsante solo con più di una fotocamera", async () => {
    const oneCamera = [{ kind: "videoinput" }] as MediaDeviceInfo[];
    const twoCameras = [
      { kind: "videoinput" },
      { kind: "videoinput" },
      { kind: "audioinput" },
    ] as MediaDeviceInfo[];

    const single = new CameraPipeline(
      makeDeps({ enumerateDevices: vi.fn().mockResolvedValue(oneCamera) }).deps,
    );
    const dual = new CameraPipeline(
      makeDeps({ enumerateDevices: vi.fn().mockResolvedValue(twoCameras) }).deps,
    );

    expect(await single.hasMultipleCameras()).toBe(false);
    expect(await dual.hasMultipleCameras()).toBe(true);
  });
});

describe("CameraPipeline — chiusura", () => {
  it("spegne camera e microfono", async () => {
    const { deps } = makeDeps();
    const pipeline = new CameraPipeline(deps);
    const started = await pipeline.start("user");

    pipeline.stop();

    expect((started.videoTrack as unknown as FakeTrack).stopped).toBe(true);
    expect((started.audioTrack as unknown as FakeTrack).stopped).toBe(true);
  });
});
