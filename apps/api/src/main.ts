import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Body JSON più ampio: gli upload immagine arrivano come data URL base64
  // (~fino a 12MB). Gli altri payload restano piccoli.
  app.useBodyParser('json', { limit: '12mb' });

  // Asset caricati (overlay immagine) serviti staticamente su /uploads.
  // CORS + CORP espliciti: l'enableCors() sopra copre solo le route NestJS; Express
  // static bypassa i guard. Senza questi header, img.crossOrigin="anonymous" fallisce
  // e il canvas risulta tainted (o il fallback blur si attiva). CORP è richiesto da
  // Chromium >= 80 (incluso il Chrome headless Egress) per risorse cross-origin.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res: import('http').ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // CORS: consenti al frontend Next.js (default :3000) di chiamare l'API.
  // WEB_ORIGIN può contenere più origin separate da virgola (es. localhost + IP LAN
  // per il test da telefono). Origin viene passato come array a enableCors.
  const corsOrigins = (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Nessun prefisso globale: i path REST (/auth, /health, /agencies/...) e il
  // namespace WebSocket /live combaciano con quanto chiama apps/web.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`LiveFlow API running on port ${port}`);
}

void bootstrap();
