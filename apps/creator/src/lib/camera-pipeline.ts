/**
 * CameraPipeline — sorgente video/audio della Creator App.
 *
 * REGOLA: si pubblica **il track della camera, senza intermediari**. Nessun
 * canvas, nessuna ricodifica: è il percorso più veloce e l'unico che conserva la
 * codifica accelerata del browser.
 *
 * Lo specchio NON si fa qui. Ribaltare l'immagine sul device obbligherebbe a
 * ridisegnare ogni frame su un canvas, e `captureStream()` fa perdere quella
 * codifica accelerata: su una webcam da PC a 720p la diretta va al rallentatore
 * (su un telefono, che pubblica ~360p, il costo si nota molto meno — ecco perché
 * il difetto sembrava riguardare solo il PC). Il ribaltamento avviene a valle,
 * dove è un filtro `hflip` di FFmpeg praticamente gratuito; qui resta solo lo
 * specchio **dell'anteprima**, che è una trasformazione CSS e non tocca lo stream.
 *
 * L'audio è indipendente: resta il track del microfono e la rotazione della
 * camera non lo tocca mai.
 */

export type Facing = "user" | "environment";

/** Iniettabili nei test: in produzione sono le API del browser. */
export interface CameraPipelineDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  createElement<K extends "video">(tag: K): HTMLElementTagNameMap[K];
}

export interface StartResult {
  /** Track da pubblicare: la camera, diretta. */
  videoTrack: MediaStreamTrack;
  /** Microfono, oppure null se non concesso/assente. */
  audioTrack: MediaStreamTrack | null;
  /** Spiegazione da mostrare quando si va live senza audio. */
  audioWarning: string | null;
}

const IDEAL_WIDTH = 640;
const IDEAL_HEIGHT = 360;

export class CameraPipeline {
  private deps: CameraPipelineDeps;
  private previewVideo: HTMLVideoElement | null = null;
  private cameraStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;

  private _facing: Facing = "user";
  private _mirrored = false;

  constructor(deps?: Partial<CameraPipelineDeps>) {
    this.deps = {
      getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
      enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
      createElement: ((tag: string) =>
        document.createElement(tag)) as CameraPipelineDeps["createElement"],
      ...deps,
    };
  }

  get facing(): Facing {
    return this._facing;
  }

  get mirrored(): boolean {
    return this._mirrored;
  }

  /**
   * Accende camera e microfono.
   *
   * Il microfono viene chiesto insieme alla camera (un solo permesso nel caso
   * normale). Se il microfono viene negato NON si fallisce: si riprova con la
   * sola camera e si segnala che la diretta partirà muta — meglio una live senza
   * audio di nessuna live, purché la creator lo sappia.
   */
  async start(facing: Facing = "user"): Promise<StartResult> {
    this._facing = facing;
    let audioWarning: string | null = null;

    let stream: MediaStream;
    try {
      stream = await this.deps.getUserMedia({
        audio: true,
        video: this.videoConstraints(facing),
      });
    } catch {
      // Secondo tentativo senza audio: se passa, il problema era il microfono;
      // se fallisce anche questo, è la camera e l'errore risale al chiamante.
      stream = await this.deps.getUserMedia({ video: this.videoConstraints(facing) });
      audioWarning =
        "Microfono non disponibile: la diretta partirà senza audio. Controlla i permessi del browser.";
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      this.audioStream = new MediaStream(audioTracks);
    } else if (!audioWarning) {
      audioWarning = "Nessun microfono rilevato: la diretta partirà senza audio.";
    }
    this.cameraStream = new MediaStream(stream.getVideoTracks());

    return {
      videoTrack: this.cameraTrack(),
      audioTrack: this.audioStream?.getAudioTracks()[0] ?? null,
      audioWarning,
    };
  }

  /** Crea il `<video>` dell'anteprima e lo monta nel contenitore dato. */
  attachPreview(container: HTMLElement, className = ""): HTMLVideoElement | null {
    const video = this.deps.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.className = className;
    video.srcObject = this.cameraStream;
    this.previewVideo = video;
    this.applyPreviewMirror();
    try {
      container.replaceChildren(video);
    } catch {
      // Contenitore non valido (ambiente di test): la pubblicazione non dipende
      // dall'anteprima, quindi si prosegue.
    }
    void video.play?.().catch(() => undefined);
    return video;
  }

  /**
   * Specchia l'ANTEPRIMA. Lo stream non viene toccato: il ribaltamento per il
   * pubblico lo applica il data-plane (vedi `setSourceMirror` lato API), così
   * qui non si paga nessuna ricodifica.
   */
  setMirrored(on: boolean): void {
    this._mirrored = on;
    this.applyPreviewMirror();
  }

  /**
   * Passa all'altra fotocamera. Il track pubblicato cambia: chi chiama deve
   * sostituirlo con `replaceTrack`, che non interrompe la diretta.
   */
  async switchCamera(): Promise<{ facing: Facing; videoTrack: MediaStreamTrack }> {
    const next: Facing = this._facing === "user" ? "environment" : "user";

    // La nuova camera si apre PRIMA di chiudere la vecchia: se il device non ha
    // la camera richiesta, si resta su quella attuale invece di restare al buio.
    const stream = await this.deps.getUserMedia({ video: this.videoConstraints(next) });

    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = stream;
    if (this.previewVideo) {
      this.previewVideo.srcObject = stream;
      void this.previewVideo.play?.().catch(() => undefined);
    }

    this._facing = next;
    return { facing: next, videoTrack: this.cameraTrack() };
  }

  /** Più di una camera = ha senso mostrare il pulsante di rotazione. */
  async hasMultipleCameras(): Promise<boolean> {
    try {
      const devices = await this.deps.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput").length > 1;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.audioStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
    this.audioStream = null;
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
      this.previewVideo = null;
    }
    this._mirrored = false;
  }

  // ── interni ────────────────────────────────────────────────────────────────

  private cameraTrack(): MediaStreamTrack {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!track) throw new Error("nessuna sorgente video disponibile");
    return track;
  }

  private videoConstraints(facing: Facing): MediaTrackConstraints {
    return {
      // `ideal` e non `exact`: un desktop senza camera posteriore deve comunque
      // restituire una camera, non un OverconstrainedError.
      facingMode: { ideal: facing },
      width: { ideal: IDEAL_WIDTH },
      height: { ideal: IDEAL_HEIGHT },
    };
  }

  /** L'anteprima riflette ciò che vedrà il pubblico (qui basta il CSS). */
  private applyPreviewMirror(): void {
    if (!this.previewVideo) return;
    this.previewVideo.style.transform = this._mirrored ? "scaleX(-1)" : "";
  }
}
