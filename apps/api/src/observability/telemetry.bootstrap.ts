import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
    SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

let otelInitialized = false;
let sdk: NodeSDK | null = null;

function isEnabled(): boolean {
    const raw = (process.env.OTEL_ENABLED ?? '').trim().toLowerCase();
    return raw === 'true' || raw === '1';
}

function resolveExporter(): OTLPTraceExporter | ConsoleSpanExporter | null {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    if (endpoint) {
        return new OTLPTraceExporter({
            url: endpoint.replace(/\/+$/, '') + '/v1/traces',
        });
    }

    const consoleExporter = (process.env.OTEL_CONSOLE_EXPORTER ?? '').trim().toLowerCase();
    if (consoleExporter === 'true' || consoleExporter === '1') {
        return new ConsoleSpanExporter();
    }

    return null;
}

export function initializeOpenTelemetry(): void {
    if (otelInitialized || !isEnabled()) {
        return;
    }

    otelInitialized = true;

    const debug = (process.env.OTEL_DEBUG ?? '').trim().toLowerCase();
    if (debug === 'true' || debug === '1') {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    }

    const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'aquita-api';
    const serviceVersion = process.env.npm_package_version?.trim() || '1.0.0';
    const environment = process.env.NODE_ENV?.trim() || 'development';
    const exporter = resolveExporter();

    sdk = new NodeSDK({
        resource: resourceFromAttributes({
            [ATTR_SERVICE_NAME]: serviceName,
            [ATTR_SERVICE_VERSION]: serviceVersion,
            [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
        }),
        traceExporter: exporter ?? undefined,
        spanProcessors: exporter
            ? [new SimpleSpanProcessor(exporter)]
            : undefined,
        instrumentations: [getNodeAutoInstrumentations()],
    });

    try {
        Promise.resolve(sdk.start()).catch((error: unknown) => {
            // Tracing must never block application startup.
            // eslint-disable-next-line no-console
            console.warn('OpenTelemetry startup failed:', error);
        });
    } catch (error: unknown) {
        // eslint-disable-next-line no-console
        console.warn('OpenTelemetry startup failed:', error);
    }
}

export async function shutdownOpenTelemetry(): Promise<void> {
    if (!sdk) {
        return;
    }

    try {
        await sdk.shutdown();
    } catch {
        // Ignore shutdown errors.
    } finally {
        sdk = null;
    }
}
