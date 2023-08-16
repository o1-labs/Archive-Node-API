import {
  BatchSpanProcessor,
  BasicTracerProvider,
  SpanExporter,
} from '@opentelemetry/tracing';
import { context, trace, Span, Tracer, Context } from '@opentelemetry/api';

export function buildProvider(exporter: SpanExporter) {
  const provider = new BasicTracerProvider();
  provider.resource.attributes['service.name'] =
    process.env.JAEGER_SERVICE_NAME ?? 'archive';

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  trace.setGlobalTracerProvider(provider);
  provider.register();
  return provider;
}

export type TraceInfo = {
  tracer: Tracer;
  ctx: Context;
  parentSpan: Span;
};

export function createTraceInfo(parentSpan: Span) {
  const tracer = getGlobalTracer();
  const ctx = trace.setSpan(context.active(), parentSpan);
  return { tracer, ctx, parentSpan } as TraceInfo;
}

export function getGlobalTracer() {
  return trace.getTracer('archive-node-graphql');
}

export function getTraceInfoFromOptions(options: unknown) {
  if (options && typeof options === 'object' && 'traceInfo' in options) {
    return options.traceInfo as TraceInfo;
  }
  throw new Error('No trace info found');
}
