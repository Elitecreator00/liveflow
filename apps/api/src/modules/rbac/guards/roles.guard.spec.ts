import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '../roles.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

// ── Helpers ───────────────────────────────────────────────────────

function makeContext(userRole: Role | null, requiredRoles: Role[] | null): ExecutionContext {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(
        userRole ? { user: { id: '1', email: 'a@b.com', role: userRole, agencyId: 'ag-1' } } : {},
      ),
    }),
  } as unknown as ExecutionContext;
  return context;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no @Roles() decorator is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(Role.CHATTER, null);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user role is in required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER, Role.MANAGER]);
    const ctx = makeContext(Role.MANAGER, [Role.OWNER, Role.MANAGER]);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny access when user role is not in required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const ctx = makeContext(Role.CHATTER, [Role.OWNER]);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny access when user is not authenticated', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should enforce RBAC hierarchy: CREATOR cannot access OWNER-only routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER, Role.MANAGER]);
    const ctx = makeContext(Role.CREATOR, [Role.OWNER, Role.MANAGER]);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ROLES_KEY constant should be "roles"', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
