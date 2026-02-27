export type UserRole = 'USER' | 'BUSINESS_OWNER' | 'ADMIN';

export const ALL_USER_ROLES: ReadonlyArray<UserRole> = ['USER', 'BUSINESS_OWNER', 'ADMIN'];

export function isUserRole(value: unknown): value is UserRole {
    return typeof value === 'string' && ALL_USER_ROLES.includes(value as UserRole);
}

export function resolveRoleHomePath(role: unknown): string {
    if (role === 'ADMIN') {
        return '/admin';
    }

    if (role === 'BUSINESS_OWNER') {
        return '/dashboard';
    }

    return '/app/customer';
}

export function resolveRoleHomeLabel(role: unknown): string {
    if (role === 'ADMIN') {
        return 'Panel Admin';
    }

    if (role === 'BUSINESS_OWNER') {
        return 'Panel Negocio';
    }

    return 'Mi Panel';
}
