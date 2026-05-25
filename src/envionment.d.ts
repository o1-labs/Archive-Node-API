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
      BLOCK_RANGE_SIZE?: string;
      ZKAPP_COMMAND_RANGE_SIZE?: string;
      ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT?: string;
      ENABLE_BLOCK_TRANSACTION_DETAILS?: string;
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
