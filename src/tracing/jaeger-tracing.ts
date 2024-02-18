import { trace } from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  BasicTracerProvider,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

import {
  validateJaegerConfig,
  parseEndpoint,
  checkJaegerEndpointAvailability,
} from './jaeger-setup.js';

export { initJaegerProvider };

function createJaegerExporter(endpoint: string) {
  return new JaegerExporter({ endpoint });
}

async function initJaegerProvider(): Promise<BasicTracerProvider | undefined> {
  const jaegerEndpoint = process.env.JAEGER_ENDPOINT;
  if (!process.env.ENABLE_JAEGER || !jaegerEndpoint) {
    return undefined;
  }

  validateJaegerConfig(jaegerEndpoint);
  const exporter = createJaegerExporter(jaegerEndpoint);
  const endpointParts = parseEndpoint(jaegerEndpoint);

  await checkJaegerEndpointAvailability(endpointParts);
  return buildProvider(exporter);
}

function buildProvider(exporter: SpanExporter) {
  const provider = new BasicTracerProvider();
  provider.resource.attributes['service.name'] =
    process.env.JAEGER_SERVICE_NAME ?? 'archive';

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();
  trace.setGlobalTracerProvider(provider);
  return provider;
}
