import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { AssetsService } from './assets.service';

const AGENCY = 'agency-test';
// 1x1 PNG trasparente
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('AssetsService', () => {
  let service: AssetsService;
  let writeSpy: jest.SpyInstance;
  let mkdirSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new AssetsService();
    mkdirSpy = jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);
    writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('saves a valid PNG data URL and returns an agency-scoped url', async () => {
    const res = await service.saveImageDataUrl(AGENCY, PNG_1PX);
    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
    expect(res.url).toMatch(new RegExp(`^/uploads/${AGENCY}/[0-9a-f-]+\\.png$`));
  });

  it('rejects a non-image / malformed data URL', async () => {
    await expect(service.saveImageDataUrl(AGENCY, 'not-a-data-url')).rejects.toThrow(
      BadRequestException,
    );
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects an unsupported mime type', async () => {
    await expect(
      service.saveImageDataUrl(AGENCY, 'data:image/tiff;base64,AAAA'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an image over the size cap', async () => {
    const big = 'A'.repeat(12 * 1024 * 1024); // ~9MB binari decodificati > 8MB
    await expect(
      service.saveImageDataUrl(AGENCY, `data:image/png;base64,${big}`),
    ).rejects.toThrow(BadRequestException);
  });
});
