import { spawn } from 'node:child_process';

const child = spawn(
    process.execPath,
    ['scripts/brave-role-audit.mjs'],
    {
        stdio: 'inherit',
        env: {
            ...process.env,
            BRAVE_ROLE_AUDIT_VIEWPORT_WIDTH: process.env.BRAVE_ROLE_AUDIT_VIEWPORT_WIDTH ?? '393',
            BRAVE_ROLE_AUDIT_VIEWPORT_HEIGHT: process.env.BRAVE_ROLE_AUDIT_VIEWPORT_HEIGHT ?? '852',
            BRAVE_ROLE_AUDIT_VIEWPORT_SCALE: process.env.BRAVE_ROLE_AUDIT_VIEWPORT_SCALE ?? '3',
            BRAVE_ROLE_AUDIT_VIEWPORT_MOBILE: process.env.BRAVE_ROLE_AUDIT_VIEWPORT_MOBILE ?? '1',
            BRAVE_ROLE_AUDIT_SETTLE_MS: process.env.BRAVE_ROLE_AUDIT_SETTLE_MS ?? '4200',
        },
    },
);

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exitCode = code ?? 1;
});
