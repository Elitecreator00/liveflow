import { IsString, IsOptional } from 'class-validator';

/**
 * MediaMTX externalAuthenticationURL POST body.
 *
 * MediaMTX v1.x sends this JSON payload to the configured
 * externalAuthenticationURL for every publisher/reader connection:
 *
 *   { "user": "", "password": "", "ip": "...", "action": "publish",
 *     "path": "live/<jwt>", "id": "...", "protocol": "rtmp", "query": "" }
 *
 * We only need the `path` field to extract the JWT stream key.
 * All other fields are optional from our validation perspective.
 */
export class MediaMtxAuthDto {
  @IsString()
  path!: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  ip?: string;

  @IsString()
  @IsOptional()
  protocol?: string;

  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  user?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  query?: string;

  // MediaMTX v1.18+ include un campo `token` nel payload di auth.
  // Va dichiarato qui: la ValidationPipe GLOBALE ha forbidNonWhitelisted,
  // quindi un campo non dichiarato farebbe fallire l'auth con 400.
  @IsString()
  @IsOptional()
  token?: string;
}
