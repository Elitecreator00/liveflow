import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub || !payload.email || !payload.role || !payload.agencyId) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      agencyId: payload.agencyId,
    };
  }
}
