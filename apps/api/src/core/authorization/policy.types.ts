export type PolicyAction = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type PolicyResource = 'business' | 'organization';

export interface ResourcePolicy {
    action: PolicyAction;
    resource: PolicyResource;
    resourceIdParam?: string;
}

