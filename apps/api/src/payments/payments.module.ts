import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsController } from './payments.controller';
import { PaymentsReportingService } from './payments-reporting.service';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookService } from './payments-webhook.service';

@Module({
    imports: [PlansModule, SubscriptionsModule, OrganizationsModule],
    controllers: [PaymentsController],
    providers: [PaymentsService, PaymentsReportingService, PaymentsWebhookService],
    exports: [PaymentsService],
})
export class PaymentsModule { }
