import { context, trace, Span, Tracer, Context } from '@opentelemetry/api';

import type { GraphQLContext } from '../context';

export {
  TracingState,
  extractTraceStateFromOptions,
  setSpanNameFromGraphQLContext,
};

class TracingState {
  private tracer: Tracer;
  private tracingContext: Context;

  constructor(parentSpan: Span) {
    this.tracer = getGlobalTracer();
    this.tracingContext = trace.setSpan(context.active(), parentSpan);
  }

  startSpan(name: string) {
    return this.tracer.startSpan(name, undefined, this.tracingContext);
  }
}

function getGlobalTracer() {
  return trace.getTracer('graphql');
}

function extractTraceStateFromOptions(options: unknown) {
  if (options && typeof options === 'object' && 'tracingState' in options) {
    return options.tracingState as TracingState;
  }
  throw new Error('tracingState not found in options');
}

function getCurrentSpanFromGraphQLContext(context: GraphQLContext) {
  const openTelemetrySymbol = Object.getOwnPropertySymbols(context).find(
    (symbol) => symbol.description === 'OPEN_TELEMETRY_GRAPHQL'
  );
  return openTelemetrySymbol ? context[openTelemetrySymbol] : undefined;
}

function setSpanNameFromGraphQLContext(
  graphQLContext: GraphQLContext,
  spanName: string
) {
  const graphQLSpan =
    getCurrentSpanFromGraphQLContext(graphQLContext) ||
    getGlobalTracer().startSpan(spanName, {}, context.active());
  graphQLSpan.updateName(spanName);
  return graphQLSpan;
}
