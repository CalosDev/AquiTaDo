export interface RequestContextState {
    requestId: string | null;
    method: string | null;
    path: string | null;
    userId: string | null;
    userRole: string | null;
    organizationId: string | null;
    organizationRole: string | null;
}

