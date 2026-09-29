import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { BrowserFarmService } from './browser-farm.service';
import { CreateRoomDto, StartRoomDto, UpdateRoomDto } from './dto/browser-room.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/roles.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * BrowserFarmController — stanze multi-browser (ADR-0011).
 * Operate da OWNER/MANAGER; la creator non gestisce le stanze.
 */
/**
 * Il minimo della risposta HTTP che serve per rispondere con un JPEG: evita di
 * dipendere dai tipi di Express, che qui non sono installati.
 */
interface JpegResponse {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
}

@Controller('browser-farm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class BrowserFarmController {
  constructor(private readonly farm: BrowserFarmService) {}

  /** POST /browser-farm/rooms — crea una stanza (fingerprint generato dal server). */
  @Post('rooms')
  @HttpCode(HttpStatus.CREATED)
  createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthenticatedUser) {
    return this.farm.createRoom(user, dto);
  }

  /** GET /browser-farm/rooms — tutte le stanze dell'agenzia. */
  @Get('rooms')
  listRooms(@CurrentUser() user: AuthenticatedUser) {
    return this.farm.listRooms(user);
  }

  /** PATCH /browser-farm/rooms/:id — settings (nome, proxy). */
  @Patch('rooms/:id')
  updateRoom(
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farm.updateRoom(user, id, dto);
  }

  /** DELETE /browser-farm/rooms/:id — elimina stanza + profilo persistente. */
  @Delete('rooms/:id')
  deleteRoom(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.farm.deleteRoom(user, id);
  }

  /** POST /browser-farm/rooms/:id/start — avvia (con o senza sorgente Studio). */
  @Post('rooms/:id/start')
  @HttpCode(HttpStatus.OK)
  startRoom(
    @Param('id') id: string,
    @Body() dto: StartRoomDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.farm.startRoom(user, id, dto);
  }

  /**
   * GET /browser-farm/rooms/runtime — stato vivo delle stanze (verifiche
   * anti-bot in corso, specchio, spettatori). La Console lo interroga per
   * avvisare l'operatore quando una stanza si ferma su un CAPTCHA.
   */
  @Get('rooms/runtime')
  runtimeStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.farm.runtimeStatus(user);
  }

  /**
   * GET /browser-farm/rooms/:id/identity — coerenza fra l'uscita di rete reale
   * e ciò che il browser dichiara. Le incoerenze qui sono la causa più comune
   * delle verifiche anti-bot.
   */
  @Get('rooms/:id/identity')
  identityCheck(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.farm.identityCheck(user, id);
  }

  /**
   * GET /browser-farm/rooms/:id/source-frame — un fotogramma JPEG di ciò che la
   * stanza sta inviando al sito (scritte e specchio compresi).
   *
   * Serve perché i siti mostrano la propria anteprima ribaltata: guardando lì,
   * scritte e specchio sembrano sbagliati anche quando sono corretti.
   */
  @Get('rooms/:id/source-frame')
  async sourceFrame(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: JpegResponse,
  ): Promise<void> {
    const frame = await this.farm.getSourceFrame(user, id);
    res.setHeader('Content-Type', 'image/jpeg');
    // Anteprima dal vivo: mai dalla cache.
    res.setHeader('Cache-Control', 'no-store');
    res.send(frame);
  }

  /** POST /browser-farm/rooms/:id/stop — ferma la stanza (il profilo resta). */
  @Post('rooms/:id/stop')
  @HttpCode(HttpStatus.OK)
  stopRoom(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.farm.stopRoom(user, id);
  }
}
