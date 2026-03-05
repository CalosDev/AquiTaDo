import { UserRole, isUserRole } from './roles';

export interface RoleCapabilities {
    role: UserRole;
    isCustomer: boolean;
    isBusinessOwner: boolean;
    isAdmin: boolean;
    canAccessCustomerPanel: boolean;
    canAccessBusinessPanel: boolean;
    canAccessAdminPanel: boolean;
    canManageOrganizations: boolean;
    canRegisterBusiness: boolean;
    isPlatformOperator: boolean;
}

const DEFAULT_ROLE: UserRole = 'USER';

function normalizeRole(role: unknown): UserRole {
    return isUserRole(role) ? role : DEFAULT_ROLE;
}

export function getRoleCapabilities(role: unknown): RoleCapabilities {
    const normalizedRole = normalizeRole(role);
    const isCustomer = normalizedRole === 'USER';
    const isBusinessOwner = normalizedRole === 'BUSINESS_OWNER';
    const isAdmin = normalizedRole === 'ADMIN';

    return {
        role: normalizedRole,
        isCustomer,
        isBusinessOwner,
        isAdmin,
        canAccessCustomerPanel: isCustomer,
        canAccessBusinessPanel: isBusinessOwner,
        canAccessAdminPanel: isAdmin,
        canManageOrganizations: false,
        canRegisterBusiness: isBusinessOwner,
        isPlatformOperator: isAdmin,
    };
}
