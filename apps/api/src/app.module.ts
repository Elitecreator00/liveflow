import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { StreamingModule } from './modules/streaming/streaming.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { CreatorsModule } from './modules/creators/creators.module';
import { HealthModule } from './modules/health/health.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { StudioModule } from './modules/studio/studio.module';
import { BrowserFarmModule } from './modules/browser-farm/browser-farm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenancyModule,
    RbacModule,
    StreamingModule,
    PlatformsModule,
    CreatorsModule,
    HealthModule,
    RealtimeModule,
    StudioModule,
    BrowserFarmModule,
  ],
})
export class AppModule {}
