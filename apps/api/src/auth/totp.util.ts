import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function normalizeBase32(input: string): string {
    return input
        .toUpperCase()
        .replace(/=+$/g, '')
        .replace(/[^A-Z2-7]/g, '');
}

export function encodeBase32(bytes: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
    }

    return output;
}

export function decodeBase32(input: string): Buffer {
    const normalized = normalizeBase32(input);
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of normalized) {
        const alphabetIndex = BASE32_ALPHABET.indexOf(char);
        if (alphabetIndex < 0) {
            continue;
        }

        value = (value << 5) | alphabetIndex;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
}

function computeHotp(secret: string, counter: number, digits = TOTP_DIGITS): string {
    const key = decodeBase32(secret);
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));

    const hash = createHmac('sha1', key).update(message).digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const binary = (
        ((hash[offset] & 0x7f) << 24)
        | ((hash[offset + 1] & 0xff) << 16)
        | ((hash[offset + 2] & 0xff) << 8)
        | (hash[offset + 3] & 0xff)
    );
    const otp = binary % (10 ** digits);
    return String(otp).padStart(digits, '0');
}

export function generateTotpSecret(byteLength = 20): string {
    return encodeBase32(randomBytes(byteLength));
}

export function generateTotpCode(
    secret: string,
    timestampMs = Date.now(),
    stepSeconds = TOTP_STEP_SECONDS,
    digits = TOTP_DIGITS,
): string {
    const counter = Math.floor(timestampMs / 1000 / stepSeconds);
    return computeHotp(secret, counter, digits);
}

export function verifyTotpCode(
    secret: string,
    code: string,
    options?: {
        timestampMs?: number;
        stepSeconds?: number;
        digits?: number;
        window?: number;
    },
): boolean {
    const normalizedCode = code.trim();
    if (!/^\d{6,8}$/.test(normalizedCode)) {
        return false;
    }

    const digits = options?.digits ?? TOTP_DIGITS;
    if (normalizedCode.length !== digits) {
        return false;
    }

    const stepSeconds = options?.stepSeconds ?? TOTP_STEP_SECONDS;
    const timestampMs = options?.timestampMs ?? Date.now();
    const window = Math.max(options?.window ?? 1, 0);
    const counter = Math.floor(timestampMs / 1000 / stepSeconds);
    const candidateBuffer = Buffer.from(normalizedCode);

    for (let i = -window; i <= window; i += 1) {
        const expectedCode = computeHotp(secret, counter + i, digits);
        const expectedBuffer = Buffer.from(expectedCode);
        if (expectedBuffer.length === candidateBuffer.length
            && timingSafeEqual(expectedBuffer, candidateBuffer)
        ) {
            return true;
        }
    }

    return false;
}

export function buildTotpOtpauthUrl(input: {
    secret: string;
    accountLabel: string;
    issuer: string;
    digits?: number;
    periodSeconds?: number;
}): string {
    const issuer = input.issuer.trim();
    const accountLabel = input.accountLabel.trim();
    const digits = input.digits ?? TOTP_DIGITS;
    const period = input.periodSeconds ?? TOTP_STEP_SECONDS;

    const label = `${issuer}:${accountLabel}`;

    return `otpauth://totp/${encodeURIComponent(label)}`
        + `?secret=${encodeURIComponent(input.secret)}`
        + `&issuer=${encodeURIComponent(issuer)}`
        + `&algorithm=SHA1`
        + `&digits=${digits}`
        + `&period=${period}`;
}
