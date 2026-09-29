import { IsString, MinLength, Matches } from 'class-validator';

export class CreateAgencyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with dashes',
  })
  slug!: string;
}
