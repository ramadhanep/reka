import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc'
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { getConfig } from '@reka/config'

let sdk: NodeSDK | null = null

export function initTelemetry(): NodeSDK | null {
  const config = getConfig()

  if (!config.otel.enabled || sdk) {
    return sdk
  }

  const exporterEndpoint = config.otel.exporterEndpoint ?? 'http://localhost:4317'
  const serviceName = config.otel.serviceName ?? 'reka'

  const traceExporter = new OTLPTraceExporter({ url: `${exporterEndpoint}/v1/traces` })
  const metricExporter = new OTLPMetricExporter({ url: `${exporterEndpoint}/v1/metrics` })
  const logExporter = new OTLPLogExporter({ url: `${exporterEndpoint}/v1/logs` })

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000,
    }),
    logRecordProcessors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
    instrumentations: [getNodeAutoInstrumentations()],
  })

  try {
    sdk.start()
    console.log('[Telemetry] OpenTelemetry initialized')
  } catch (error) {
    console.error(
      '[Telemetry] Failed to initialize:',
      error instanceof Error ? error.message : String(error),
    )
    sdk = null
  }

  return sdk
}

export function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return Promise.resolve()
  }
  return sdk.shutdown().then(() => {
    sdk = null
  })
}

export function isTelemetryEnabled(): boolean {
  const config = getConfig()
  return config.otel.enabled
}
