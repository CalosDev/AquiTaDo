import { SetMetadata } from '@nestjs/common';
import { ResourcePolicy } from './policy.types';

export const POLICY_KEY = 'policy';
export const Policy = (policy: ResourcePolicy) => SetMetadata(POLICY_KEY, policy);

