import { context, trace, Span, Tracer, Context } from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  BasicTracerProvider,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base';

import {
  validateJaegerConfig,
  createJaegerExporter,
  parseEndpoint,
  checkJaegerEndpointAvailability,
} from './jaeger-setup';

export {
  initJaegerProvider,
  createTraceInfo,
  getGlobalTracer,
  getTraceInfoFromOptions,
  TraceInfo,
};

type TraceInfo = {
  tracer: Tracer;
  ctx: Context;
  parentSpan: Span;
};

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
  trace.setGlobalTracerProvider(provider);
  provider.register();
  return provider;
}

function getGlobalTracer() {
  return trace.getTracer('archive-node-graphql');
}

function createTraceInfo(parentSpan: Span) {
  const tracer = getGlobalTracer();
  const ctx = trace.setSpan(context.active(), parentSpan);
  return { tracer, ctx, parentSpan } as TraceInfo;
}

function getTraceInfoFromOptions(options: unknown) {
  if (options && typeof options === 'object' && 'traceInfo' in options) {
    return options.traceInfo as TraceInfo;
  }
  throw new Error('No trace info found');
}
