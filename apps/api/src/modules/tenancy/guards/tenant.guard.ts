import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

/**
 * TenantGuard — enforces that the :agencyId route param matches the
 * authenticated user's agencyId. Prevents cross-tenant data access.
 *
 * Apply after JwtAuthGuard on any route that exposes :agencyId.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      params: Record<string, string>;
    }>();

    const user = request.user;
    const agencyId = request.params['agencyId'];

    if (!agencyId) return true; // no param to check

    if (user.agencyId !== agencyId) {
      throw new ForbiddenException('Access to this agency is not allowed');
    }

    return true;
  }
}
