import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  BatchSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/tracing';

export function buildProvider() {
  const options = {
    endpoint: process.env.JAEGER_ENDPOINT,
  };
  const exporter = new JaegerExporter(options);
  const provider = new BasicTracerProvider();
  provider.resource.attributes['service.name'] =
    process.env.JAEGER_SERVICE_NAME ?? 'archive';

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();
  return provider;
}
