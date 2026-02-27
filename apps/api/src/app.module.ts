import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from './cache/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CategoriesModule } from './categories/categories.module';
import { FeaturesModule } from './features/features.module';
import { SearchModule } from './search/search.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { LocationsModule } from './locations/locations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { PromotionsModule } from './promotions/promotions.module';
import { BookingsModule } from './bookings/bookings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MessagingModule } from './messaging/messaging.module';
import { CrmModule } from './crm/crm.module';
import { ReputationModule } from './reputation/reputation.module';
import { AdsModule } from './ads/ads.module';
import { VerificationModule } from './verification/verification.module';
import { ResilienceModule } from './resilience/resilience.module';
import { ObservabilityModule } from './observability/observability.module';
import { AiModule } from './ai/ai.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RequestContextModule } from './core/request-context/request-context.module';
import { DomainEventsModule } from './core/events/domain-events.module';
import { AuthorizationModule } from './core/authorization/authorization.module';
import { RequestContextInterceptor } from './core/interceptors/request-context.interceptor';
import { JsonApiResponseInterceptor } from './core/interceptors/json-api-response.interceptor';
import { PublicCacheInterceptor } from './core/interceptors/public-cache.interceptor';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { validateEnv } from './config/env.validation';
import { SecurityModule } from './security/security.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnv,
        }),
        ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                throttlers: [
                    {
                        name: 'default',
                        ttl: Number(configService.get('THROTTLE_TTL_MS') ?? 60_000),
                        limit: Number(configService.get('THROTTLE_LIMIT') ?? 120),
                    },
                ],
            }),
        }),
        RedisModule,
        ResilienceModule,
        RequestContextModule,
        DomainEventsModule,
        AuthorizationModule,
        SecurityModule,
        PrismaModule,
        ObservabilityModule,
        AuthModule,
        UsersModule,
        BusinessesModule,
        CategoriesModule,
        FeaturesModule,
        SearchModule,
        DiscoveryModule,
        LocationsModule,
        ReviewsModule,
        UploadsModule,
        HealthModule,
        OrganizationsModule,
        PlansModule,
        SubscriptionsModule,
        PaymentsModule,
        PromotionsModule,
        BookingsModule,
        AnalyticsModule,
        MessagingModule,
        CrmModule,
        ReputationModule,
        AdsModule,
        VerificationModule,
        AiModule,
        WhatsAppModule,
        NotificationsModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: RequestContextInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: JsonApiResponseInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: PublicCacheInterceptor,
        },
        {
            provide: APP_FILTER,
            useClass: GlobalExceptionFilter,
        },
    ],
})
export class AppModule { }
