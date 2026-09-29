import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { CryptoService } from './crypto.service';

// Valid 32-byte (64 hex char) test key
const VALID_HEX_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

const mockConfig = (key: string) => ({
  getOrThrow: jest.fn().mockReturnValue(key),
});

async function buildService(hexKey: string): Promise<CryptoService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CryptoService,
      { provide: ConfigService, useValue: mockConfig(hexKey) },
    ],
  }).compile();
  return module.get<CryptoService>(CryptoService);
}

describe('CryptoService', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('should decrypt to the original plaintext', async () => {
      const service = await buildService(VALID_HEX_KEY);
      const plaintext = 'my_secret_stream_key_12345';
      const encrypted = service.encrypt(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should produce different ciphertext for the same input (random IV)', async () => {
      const service = await buildService(VALID_HEX_KEY);
      const plaintext = 'same_plaintext';
      const enc1 = service.encrypt(plaintext);
      const enc2 = service.encrypt(plaintext);
      expect(enc1).not.toBe(enc2);
    });

    it('should round-trip special characters and Unicode', async () => {
      const service = await buildService(VALID_HEX_KEY);
      const plaintext = '€ symbols & 日本語 / slashes "quotes"';
      expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
    });

    it('should round-trip an empty string', async () => {
      const service = await buildService(VALID_HEX_KEY);
      expect(service.decrypt(service.encrypt(''))).toBe('');
    });
  });

  describe('error cases', () => {
    it('should throw InternalServerErrorException when key is wrong length', async () => {
      await expect(buildService('deadbeef')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw when ciphertext is tampered (auth tag mismatch)', async () => {
      const service = await buildService(VALID_HEX_KEY);
      const encrypted = service.encrypt('secret');
      // Flip last byte in the base64 decoded buffer
      const buf = Buffer.from(encrypted, 'base64');
      buf[buf.length - 1] ^= 0xff;
      const tampered = buf.toString('base64');
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw when ciphertext is too short', async () => {
      const service = await buildService(VALID_HEX_KEY);
      // 27 bytes is less than IV(12) + TAG(16) = 28
      const tooShort = Buffer.alloc(27).toString('base64');
      expect(() => service.decrypt(tooShort)).toThrow('Invalid ciphertext: too short');
    });
  });
});
