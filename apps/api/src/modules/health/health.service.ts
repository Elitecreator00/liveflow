import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MediaMtxPath {
  name: string;
  source?: { type: string; id: string };
  readers: Array<{ type: string; id: string; bytesReceived: number; bytesSent: number }>;
  bytesReceived: number;
  bytesSent: number;
}

export interface MediaMtxPathsResponse {
  itemCount: number;
  pageCount: number;
  items: MediaMtxPath[];
}

export interface StreamHealthStatus {
  isPublishing: boolean;
  readerCount: number;
  bytesReceived: number;
  bytesSent: number;
  paths: MediaMtxPath[];
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly config: ConfigService) {}

  async getMediaMtxPaths(): Promise<StreamHealthStatus> {
    const apiUrl = this.config.get<string>('MEDIAMTX_API_URL') ?? 'http://localhost:9997';

    const res = await fetch(`${apiUrl}/v3/paths/list`);
    if (!res.ok) {
      throw new Error(`MediaMTX API responded with ${res.status}`);
    }

    const data = (await res.json()) as MediaMtxPathsResponse;
    const paths = data.items ?? [];

    const totalReaders = paths.reduce((sum, p) => sum + (p.readers?.length ?? 0), 0);
    const totalBytesReceived = paths.reduce((sum, p) => sum + (p.bytesReceived ?? 0), 0);
    const totalBytesSent = paths.reduce((sum, p) => sum + (p.bytesSent ?? 0), 0);

    return {
      isPublishing: paths.some((p) => p.source != null),
      readerCount: totalReaders,
      bytesReceived: totalBytesReceived,
      bytesSent: totalBytesSent,
      paths,
    };
  }
}
