declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LOG_LEVEL: string;
      PORT?: string;
      PG_CONN: string;
      CORS_ORIGIN?: string;
      READINESS_PING_TIMEOUT_MS?: string;
      ENABLE_LOGGING?: bool;
      ENABLE_METRICS?: bool;
      ENABLE_INTROSPECTION?: bool;
      ENABLE_GRAPHIQL?: bool;
      ENABLE_JAEGER?: bool;
      JAEGER_ENDPOINT?: string;
      JAEGER_SERVICE_NAME?: string;
    }
  }
}

export {};
