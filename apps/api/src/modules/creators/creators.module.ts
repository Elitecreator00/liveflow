import { Module } from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { CreatorsController } from './creators.controller';
import { TenancyModule } from '../tenancy/tenancy.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TenancyModule, RbacModule],
  providers: [CreatorsService],
  controllers: [CreatorsController],
  exports: [CreatorsService],
})
export class CreatorsModule {}
