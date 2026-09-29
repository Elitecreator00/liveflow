import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { UploadImageResponse } from './dto/upload-image.dto';

/**
 * Storage degli asset immagine caricati dall'operatore (overlay scena).
 *
 * Dev: salva su disco in `<cwd>/uploads/<agencyId>/` (servito staticamente
 * dall'API su `/uploads`). L'URL ritornato è corto e referenziabile dagli
 * overlay senza gonfiare lo scene state (a differenza di un data URL inline).
 *
 * TODO prod: object storage (S3/GCS) + CDN, e URL assoluto raggiungibile anche
 * dal renderer LiveKit Egress (cloud). Vedi ADR-0004.
 */
@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private readonly root = join(process.cwd(), 'uploads');
  private readonly MAX_BYTES = 8 * 1024 * 1024;
  private readonly EXT_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };

  async saveImageDataUrl(
    agencyId: string,
    dataUrl: string,
  ): Promise<UploadImageResponse> {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new BadRequestException('data URL non valido');

    const mime = match[1].toLowerCase();
    const ext = this.EXT_BY_MIME[mime];
    if (!ext) {
      throw new BadRequestException(
        `Tipo immagine non supportato: ${mime} (ammessi: PNG, JPG, WEBP, GIF, SVG)`,
      );
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) throw new BadRequestException('Immagine vuota');
    if (buffer.length > this.MAX_BYTES) {
      throw new BadRequestException('Immagine troppo grande (max 8MB)');
    }

    const dir = join(this.root, agencyId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(dir, filename), buffer);

    this.logger.log(`Asset salvato: ${agencyId}/${filename} (${buffer.length} B)`);
    return { url: `/uploads/${agencyId}/${filename}` };
  }
}
