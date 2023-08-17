import type { Span } from '@opentelemetry/api';
import type { TraceInfo } from 'src/tracing';
import type { ITracingService } from './tracing-service.interface';

export { TracingService };

class TracingService implements ITracingService {
  private spanStack: Span[];
  private traceInfo: TraceInfo;

  constructor(traceInfo: TraceInfo) {
    this.traceInfo = traceInfo;
    this.spanStack = [];
  }

  startSpan(name: string) {
    const span = this.traceInfo.tracer.startSpan(
      name,
      undefined,
      this.traceInfo.ctx
    );
    this.spanStack.push(span);
  }

  endSpan() {
    if (this.spanStack.length === 0) {
      throw Error('No spans to end');
    }
    const span = this.spanStack.pop();
    if (!span) return;
    span.end();
  }
}
