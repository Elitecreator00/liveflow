import { IsBoolean } from 'class-validator';

/** Corpo di POST /studio/ingest-session/:id/mirror. */
export class SetMirrorDto {
  @IsBoolean()
  mirrored!: boolean;
}
