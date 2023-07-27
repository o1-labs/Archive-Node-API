import { TraceInfo } from './index';
import { Span } from '@opentelemetry/api';

export { TracingService };

class TracingService {
  private spans: Span[];
  private traceInfo: TraceInfo;

  constructor(traceInfo: TraceInfo) {
    this.traceInfo = traceInfo;
    this.spans = [];
  }

  startSpan(name: string) {
    const span = this.traceInfo.tracer.startSpan(
      name,
      undefined,
      this.traceInfo.ctx
    );
    this.spans.push(span);
  }

  endSpan() {
    if (this.spans.length === 0) {
      throw Error('No spans to end');
    }
    const span = this.spans.pop();
    if (!span) return;
    span.end();
  }
}
