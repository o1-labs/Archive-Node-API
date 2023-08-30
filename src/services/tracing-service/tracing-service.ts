import type { Span } from '@opentelemetry/api';
import type { TraceInfo } from '../../tracing';
import type { ITracingService } from './tracing-service.interface';

export { TracingService };

class TracingService implements ITracingService {
  private readonly spanStack: Span[] = [];
  private readonly traceInfo: TraceInfo;

  constructor(traceInfo: TraceInfo) {
    this.traceInfo = traceInfo;
  }

  startSpan(name: string): void {
    const span = this.traceInfo.tracer.startSpan(
      name,
      undefined,
      this.traceInfo.ctx
    );
    this.spanStack.push(span);
  }

  endSpan(): void {
    if (this.spanStack.length === 0) {
      throw new Error('No spans to end');
    }
    const span = this.spanStack.pop();
    if (!span) {
      throw new Error('Failed to retrieve the span from the stack');
    }
    span.end();
  }
}
