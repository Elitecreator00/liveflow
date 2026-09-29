import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type OverlayType = 'text' | 'image';

/**
 * Un overlay della scena. Posizione e dimensioni sono in PERCENTUALE del canvas
 * (0–100), così il rendering è indipendente dalla risoluzione e l'editor
 * operatore è WYSIWYG rispetto al render cloud (Egress, ADR-0004).
 */
export class OverlayDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsIn(['text', 'image'])
  type!: OverlayType;

  /** % dal bordo sinistro */
  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  /** % dal bordo superiore */
  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  /** larghezza in % della larghezza canvas */
  @IsNumber()
  @Min(1)
  @Max(100)
  width!: number;

  /** ordine di sovrapposizione (z-index relativo) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999)
  z?: number;

  @IsBoolean()
  visible!: boolean;

  // ── Text overlay ─────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  /** dimensione font in % della larghezza canvas (scala con il video) */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  fontSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  background?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  fontWeight?: string;

  // ── Image overlay ────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;
}

/**
 * Filtri/effetti applicati alla sorgente video. Valori "neutri": brightness/
 * contrast/saturate = 100 (%), gli altri = 0. Resi via CSS `filter` sia nella
 * preview operatore sia (in futuro) nella pagina scena dell'Egress → WYSIWYG.
 */
export class SceneFiltersDto {
  @IsOptional() @IsNumber() @Min(0) @Max(300) brightness?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) contrast?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) saturate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) grayscale?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) sepia?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) invert?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(360) hueRotate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(20) blur?: number;
  /** nome del preset selezionato (solo UI) */
  @IsOptional() @IsString() @MaxLength(40) preset?: string;
}

/**
 * Sfondo AI (ADR-0007 §1, step B.3). Segmentazione persona (MediaPipe Selfie
 * Segmentation) calcolata LATO render (pagina-scena Egress) e nella preview
 * operatore → WYSIWYG. L'operatore sceglie la modalità; la creator pubblica
 * grezzo e non esegue nulla ("device dumb, cloud smart").
 */
export class SceneBackgroundDto {
  @IsIn(['none', 'blur', 'image'])
  mode!: 'none' | 'blur' | 'image';

  /** raggio di sfocatura in px (mode 'blur') */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(40)
  blur?: number;

  /** URL immagine di sfondo (mode 'image'); stesso storage degli overlay immagine */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}

/**
 * Effetti AR sul volto (ADR-0007 §2, step B.4).
 * Calcolati lato nostro (MediaPipe Face Landmarker), controllati dall'operatore.
 * Tutti i campi sono opzionali; assenza = effetto disattivato (retrocompatibile).
 */
export class BeautifyEffectDto {
  @IsBoolean() enabled!: boolean;
  @IsNumber() @Min(0) @Max(100) intensity!: number;
}

export class FacePrivacyEffectDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(['pixelate', 'blur']) mode!: 'pixelate' | 'blur';
  @IsNumber() @Min(0) @Max(100) intensity!: number;
}

export class SceneEffectsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BeautifyEffectDto)
  beautify?: BeautifyEffectDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FacePrivacyEffectDto)
  facePrivacy?: FacePrivacyEffectDto;
}

export class UpdateSceneDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OverlayDto)
  overlays!: OverlayDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SceneFiltersDto)
  filters?: SceneFiltersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SceneBackgroundDto)
  background?: SceneBackgroundDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SceneEffectsDto)
  effects?: SceneEffectsDto;
}

export interface SceneState {
  sessionId: string;
  overlays: OverlayDto[];
  filters?: SceneFiltersDto;
  background?: SceneBackgroundDto;
  effects?: SceneEffectsDto;
  updatedAt: string;
}
