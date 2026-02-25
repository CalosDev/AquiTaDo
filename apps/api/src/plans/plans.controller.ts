import { Controller, Get, Inject } from '@nestjs/common';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
    constructor(
        @Inject(PlansService)
        private readonly plansService: PlansService,
    ) { }

    @Get()
    async findPublicPlans() {
        return this.plansService.findPublicPlans();
    }
}
