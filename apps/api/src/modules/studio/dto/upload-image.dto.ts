import { IsString, Matches, MaxLength } from 'class-validator';

export class UploadImageDto {
  /**
   * Immagine come data URL base64 (`data:image/<tipo>;base64,....`).
   * Limite di lunghezza ~12MB base64 (≈ 8MB binari); il tipo/size effettivi
   * sono validati lato AssetsService.
   */
  @IsString()
  @MaxLength(12_000_000)
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, {
    message: 'dataUrl deve essere un data URL immagine base64',
  })
  dataUrl!: string;
}

export interface UploadImageResponse {
  /** URL assoluto/relativo servito staticamente dall'API (es. /uploads/<agency>/<id>.png) */
  url: string;
}
