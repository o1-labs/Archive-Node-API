export interface ITracingService {
  startSpan(name: string): void;
  endSpan(): void;
}
