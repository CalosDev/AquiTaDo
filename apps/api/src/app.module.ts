import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BusinessesModule } from './businesses/businesses.module';
import { CategoriesModule } from './categories/categories.module';
import { LocationsModule } from './locations/locations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { validateEnv } from './config/env.validation';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateEnv,
        }),
        ThrottlerModule.forRoot({
            throttlers: [
                {
                    name: 'default',
                    ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
                    limit: Number(process.env.THROTTLE_LIMIT ?? 120),
                },
            ],
        }),
        PrismaModule,
        AuthModule,
        UsersModule,
        BusinessesModule,
        CategoriesModule,
        LocationsModule,
        ReviewsModule,
        UploadsModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule { }
