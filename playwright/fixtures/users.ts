export type QaUserPayload = {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: 'USER' | 'BUSINESS_OWNER';
};

export const ADMIN_CREDENTIALS = {
    email: process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@aquita.do',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'admin12345',
} as const;

export function createQaUserPayload(role: QaUserPayload['role'] = 'USER'): QaUserPayload {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
        name: `QA ${role} ${seed}`,
        email: `qa+${seed}@example.com`,
        password: 'Test123456!',
        phone: '8095550000',
        role,
    };
}
