import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { CreateCreatorDto } from './dto/create-creator.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../tenancy/guards/tenant.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/roles.enum';

@Controller('agencies/:agencyId/creators')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CreatorsController {
  constructor(private readonly creators: CreatorsService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('agencyId') agencyId: string,
    @Body() dto: CreateCreatorDto,
  ) {
    return this.creators.create(agencyId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  list(@Param('agencyId') agencyId: string) {
    return this.creators.list(agencyId);
  }

  @Delete(':creatorId')
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('agencyId') agencyId: string,
    @Param('creatorId') creatorId: string,
  ) {
    return this.creators.delete(agencyId, creatorId);
  }
}
