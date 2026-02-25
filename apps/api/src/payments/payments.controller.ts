import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
    Query,
    Res,
    Req,
    UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Response } from 'express';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingReportQueryDto, ListPaymentsQueryDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
    constructor(
        @Inject(PaymentsService)
        private readonly paymentsService: PaymentsService,
    ) { }

    @Post('webhooks/stripe')
    @HttpCode(HttpStatus.OK)
    async handleStripeWebhook(
        @Headers('stripe-signature') signature: string | undefined,
        @Req() request: Request,
        @Body() parsedBody: unknown,
    ) {
        const rawBody = (request as Request & { rawBody?: Buffer }).rawBody ?? parsedBody;
        return this.paymentsService.handleStripeWebhook(signature, rawBody);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listMyPayments(
        @CurrentUser('id') _userId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListPaymentsQueryDto,
    ) {
        return this.paymentsService.listMyPayments(organizationId, query.limit);
    }

    @Get('invoices/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listMyInvoices(
        @CurrentUser('id') _userId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListPaymentsQueryDto,
    ) {
        return this.paymentsService.listMyInvoices(organizationId, query.limit);
    }

    @Get('reports/summary/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getBillingSummary(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: BillingReportQueryDto,
    ) {
        return this.paymentsService.getBillingSummary(
            organizationId,
            query.from,
            query.to,
        );
    }

    @Get('invoices/export.csv')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async exportInvoicesCsv(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: BillingReportQueryDto,
        @Res() response: Response,
    ) {
        const payload = await this.paymentsService.exportInvoicesCsv(
            organizationId,
            query.from,
            query.to,
        );

        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
        response.send(payload.csv);
    }

    @Get('payments/export.csv')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async exportPaymentsCsv(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: BillingReportQueryDto,
        @Res() response: Response,
    ) {
        const payload = await this.paymentsService.exportPaymentsCsv(
            organizationId,
            query.from,
            query.to,
        );

        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
        response.send(payload.csv);
    }
}
