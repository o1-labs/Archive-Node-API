declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LOG_LEVEL: string;
      PORT?: string;
      PG_CONN: string;
      SHUTDOWN_TIMEOUT_MS?: string;
      CORS_ORIGIN?: string;
      READINESS_PING_TIMEOUT_MS?: string;
      RATE_LIMIT_MAX?: string;
      RATE_LIMIT_WINDOW_MS?: string;
      TRUST_PROXY?: string;
      GRAPHQL_MAX_DEPTH?: string;
      GRAPHQL_MAX_ALIASES?: string;
      GRAPHQL_MAX_TOKENS?: string;
      GRAPHQL_MAX_COST?: string;
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
