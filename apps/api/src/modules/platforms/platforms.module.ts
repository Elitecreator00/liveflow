import { Module } from '@nestjs/common';
import { PlatformsService } from './platforms.service';
import { PlatformsController } from './platforms.controller';
import { CryptoModule } from '../crypto/crypto.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [CryptoModule, TenancyModule, RbacModule],
  providers: [PlatformsService],
  controllers: [PlatformsController],
  exports: [PlatformsService],
})
export class PlatformsModule {}
