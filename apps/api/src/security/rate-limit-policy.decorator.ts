import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_POLICY_KEY = 'rate_limit_policy';

export type RateLimitPolicyName = 'default' | 'search' | 'ai';

export const RateLimitPolicy = (policy: RateLimitPolicyName) =>
    SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
