import { spawn, ChildProcess } from 'child_process';
import { Injectable, Logger } from '@nestjs/common';
import {
  IFfmpegRunner,
  FfmpegLaunchOptions,
  FfmpegProcess,
} from '../interfaces/ffmpeg-runner.interface';

class ChildFfmpegProcess implements FfmpegProcess {
  private proc: ChildProcess;
  private _alive = true;

  constructor(
    readonly targetId: string,
    proc: ChildProcess,
  ) {
    this.proc = proc;
    proc.on('exit', () => { this._alive = false; });
  }

  get isAlive(): boolean { return this._alive; }

  kill(): void {
    if (this._alive) this.proc.kill('SIGTERM');
  }
}

/**
 * ChildProcessRunner — real implementation using Node child_process.spawn.
 * One independent ffmpeg process per fanout target (ADR-0002).
 */
@Injectable()
export class ChildProcessFfmpegRunner implements IFfmpegRunner {
  private readonly logger = new Logger(ChildProcessFfmpegRunner.name);

  launch(opts: FfmpegLaunchOptions): FfmpegProcess {
    const args = [
      '-loglevel', 'warning',
      '-re', '-i', opts.sourceUrl,
      '-c', 'copy',
      '-f', 'flv', opts.destinationUrl,
    ];

    this.logger.log(`Launching ffmpeg for target ${opts.targetId}: ${opts.destinationUrl}`);

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr?.on('data', (data: Buffer) => {
      this.logger.warn(`[ffmpeg:${opts.targetId}] ${data.toString().trim()}`);
    });

    proc.on('exit', (code, signal) => {
      this.logger.log(`ffmpeg[${opts.targetId}] exited code=${code} signal=${signal}`);
      opts.onExit(code, signal);
    });

    proc.on('error', (err) => {
      this.logger.error(`ffmpeg[${opts.targetId}] error: ${err.message}`);
      opts.onError(err);
    });

    return new ChildFfmpegProcess(opts.targetId, proc);
  }
}
