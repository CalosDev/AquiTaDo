import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import {
    CreateBookingDto,
    ListBookingsQueryDto,
    ListTransactionsQueryDto,
    UpdateBookingStatusDto,
} from './dto/booking.dto';
import { BookingsService } from './bookings.service';

@Controller('bookings')
export class BookingsController {
    constructor(
        @Inject(BookingsService)
        private readonly bookingsService: BookingsService,
    ) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    async createForUser(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateBookingDto,
    ) {
        return this.bookingsService.createForUser(userId, dto);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async listMyBookings(
        @CurrentUser('id') userId: string,
        @Query() query: ListBookingsQueryDto,
    ) {
        return this.bookingsService.listMyBookings(userId, query);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listOrganizationBookings(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListBookingsQueryDto,
    ) {
        return this.bookingsService.listOrganizationBookings(organizationId, query);
    }

    @Get('transactions/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listOrganizationTransactions(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListTransactionsQueryDto,
    ) {
        return this.bookingsService.listOrganizationTransactions(organizationId, query);
    }

    @Patch(':id/status')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async updateStatus(
        @Param('id', new ParseUUIDPipe()) bookingId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: UpdateBookingStatusDto,
    ) {
        return this.bookingsService.updateStatus(
            bookingId,
            organizationId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }
}
