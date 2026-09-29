import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — route is accessible to all authenticated users
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;

    if (!user) throw new ForbiddenException('User not authenticated');

    const hasRole = required.includes(user.role as Role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Requires role: ${required.join(' | ')}. Current: ${user.role}`,
      );
    }

    return true;
  }
}
