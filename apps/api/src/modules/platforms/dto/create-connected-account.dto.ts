import { IsEnum, IsObject, IsString } from 'class-validator';
import { Platform } from '@prisma/client';

export class CreateConnectedAccountDto {
  @IsString()
  creatorId!: string;

  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  platformUsername!: string;

  /** Raw credentials — will be encrypted at rest. Never logged. */
  @IsObject()
  credentials!: Record<string, string>;
}
