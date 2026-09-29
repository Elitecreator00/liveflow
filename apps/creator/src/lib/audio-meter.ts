/**
 * AudioMeter — livello del microfono, 0..1.
 *
 * Serve a rendere l'audio *visibile*: "la sorgente comprende l'audio" non è
 * verificabile guardando un'anteprima muta, e una live andata in onda senza
 * audio si scopre sempre troppo tardi. Con l'indicatore la creator vede la barra
 * muoversi mentre parla, prima e durante la diretta.
 */
export class AudioMeter {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;

  /** Avvia la misura sul microfono. Silenzioso se l'AudioContext non è disponibile. */
  start(stream: MediaStream): void {
    this.stop();
    const Ctor =
      typeof window !== "undefined"
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return;

    try {
      const context = new Ctor();
      const analyser = context.createAnalyser();
      // Finestra corta: interessa il movimento della voce, non l'analisi spettrale.
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      // NB: l'analyser non va collegato alla destination, altrimenti la creator
      // si risentirebbe in cuffia (e in altoparlante darebbe feedback).
      this.context = context;
      this.analyser = analyser;
      this.source = source;
      this.buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      this.stop();
    }
  }

  /**
   * Livello corrente (RMS normalizzato). 0 = silenzio.
   * Su iOS l'AudioContext parte sospeso finché non c'è un gesto utente: qui si
   * riprende alla prima lettura, che avviene dopo il tap su "Vai Live".
   */
  read(): number {
    if (!this.analyser || !this.buffer) return 0;
    if (this.context?.state === "suspended") void this.context.resume();

    this.analyser.getByteTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      const v = ((this.buffer[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.buffer.length);
    // ×4: il parlato normale sta sotto 0.25 RMS e resterebbe una barra ferma.
    return Math.min(1, rms * 4);
  }

  stop(): void {
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      void this.context?.close();
    } catch {
      // già chiuso
    }
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.buffer = null;
  }
}
