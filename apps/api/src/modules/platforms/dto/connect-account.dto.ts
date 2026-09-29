import { IsEnum, IsString } from 'class-validator';
import { Platform } from '@prisma/client';

/**
 * ConnectAccountDto — body for POST .../accounts
 * The streamKey is the raw platform stream key; it will be encrypted at rest.
 */
export class ConnectAccountDto {
  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  platformUsername!: string;

  @IsString()
  streamKey!: string;
}
