import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  BatchSpanProcessor,
  BasicTracerProvider,
} from '@opentelemetry/tracing';
import { context, trace, Span, Tracer, Context } from '@opentelemetry/api';

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

export type TraceInfo = {
  tracer: Tracer;
  ctx: Context;
  parentSpan: Span;
};

export function getTraceInfoFromGraphQL(parentSpan: Span | undefined) {
  if (!parentSpan) return null;
  const tracer = trace.getTracer('graphql');
  const ctx = trace.setSpan(context.active(), parentSpan);

  return { tracer, ctx, parentSpan } as TraceInfo;
}

export function getTraceInfoFromOptions(options: unknown): TraceInfo {
  if (options && typeof options === 'object' && 'traceInfo' in options) {
    return options.traceInfo as TraceInfo;
  }
  throw new Error(
    "Invalid options object: Missing or invalid 'traceInfo' property"
  );
}
