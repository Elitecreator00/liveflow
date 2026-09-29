/**
 * IFfmpegRunner — abstraction over spawning/killing an ffmpeg process.
 *
 * Keeping this interface separate makes the FanoutManager fully testable
 * without spawning real processes (inject a mock in tests).
 */
export interface FfmpegProcess {
  readonly targetId: string;
  kill(): void;
  readonly isAlive: boolean;
}

export interface FfmpegLaunchOptions {
  /** MediaMTX RTMP source URL, e.g. rtmp://localhost:1935/live/{streamKey} */
  sourceUrl: string;
  /** Target RTMP destination, e.g. rtmp://live.twitch.tv/app/{key} */
  destinationUrl: string;
  targetId: string;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError: (err: Error) => void;
}

export const FFMPEG_RUNNER_TOKEN = 'FFMPEG_RUNNER';

export interface IFfmpegRunner {
  launch(options: FfmpegLaunchOptions): FfmpegProcess;
}
