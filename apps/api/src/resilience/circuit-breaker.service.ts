import {
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CircuitState = {
    failures: number;
    openedUntil: number;
};

@Injectable()
export class CircuitBreakerService {
    private readonly logger = new Logger(CircuitBreakerService.name);
    private readonly stateByKey = new Map<string, CircuitState>();
    private readonly failureThreshold: number;
    private readonly cooldownMs: number;

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
    ) {
        this.failureThreshold = this.resolvePositiveInt('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5);
        this.cooldownMs = this.resolvePositiveInt('CIRCUIT_BREAKER_COOLDOWN_MS', 60_000);
    }

    async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const state = this.stateByKey.get(key) ?? { failures: 0, openedUntil: 0 };

        if (state.openedUntil > now) {
            throw new ServiceUnavailableException(
                `El servicio externo "${key}" esta temporalmente protegido por circuit breaker`,
            );
        }

        try {
            const result = await operation();
            if (state.failures > 0 || state.openedUntil > 0) {
                this.stateByKey.set(key, { failures: 0, openedUntil: 0 });
            }
            return result;
        } catch (error) {
            const nextFailures = state.failures + 1;
            const shouldOpen = nextFailures >= this.failureThreshold;
            const openedUntil = shouldOpen ? now + this.cooldownMs : 0;

            this.stateByKey.set(key, {
                failures: shouldOpen ? 0 : nextFailures,
                openedUntil,
            });

            if (shouldOpen) {
                this.logger.warn(
                    `Circuit breaker opened for "${key}" during ${this.cooldownMs}ms`,
                );
                throw new ServiceUnavailableException(
                    `El servicio externo "${key}" no esta disponible temporalmente`,
                );
            }

            throw error;
        }
    }

    private resolvePositiveInt(envKey: string, fallbackValue: number): number {
        const rawValue = this.configService.get<string>(envKey);
        if (!rawValue) {
            return fallbackValue;
        }

        const parsed = Number(rawValue);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return fallbackValue;
        }

        return parsed;
    }
}
