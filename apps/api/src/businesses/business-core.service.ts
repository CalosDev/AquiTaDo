import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from '../core/persistence/base.service';
import { Business } from '../generated/prisma/client';
import { BusinessRepository } from './business.repository';

@Injectable()
export class BusinessCoreService extends BaseService<Business> {
    constructor(
        @Inject(BusinessRepository)
        repository: BusinessRepository,
    ) {
        super(repository);
    }
}

