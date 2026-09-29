import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit nonce (recommended for GCM)
const TAG_BYTES = 16;

/**
 * CryptoService — AES-256-GCM symmetric encryption for credential storage.
 *
 * Wire format (base64-encoded): iv(12) + tag(16) + ciphertext(n)
 * Key: CREDS_ENCRYPTION_KEY env var, 32-byte hex string (64 hex chars).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = this.config.getOrThrow<string>('CREDS_ENCRYPTION_KEY');
    if (hexKey.length !== 64) {
      throw new InternalServerErrorException(
        'CREDS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertextBuf = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    // Layout: iv(12) || tag(16) || ciphertext
    const combined = Buffer.concat([iv, tag, ciphertextBuf]);
    return combined.toString('base64');
  }

  decrypt(encoded: string): string {
    const combined = Buffer.from(encoded, 'base64');
    if (combined.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Invalid ciphertext: too short');
    }
    const iv = combined.subarray(0, IV_BYTES);
    const tag = combined.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = combined.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
