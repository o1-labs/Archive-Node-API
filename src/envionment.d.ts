declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      PG_CONN: string;
      CORS_ORIGIN?: string;
      ENABLE_LOGGING?: bool;
      ENABLE_INTROSPECTION?: bool;
      ENABLE_GRAPHIQL?: bool;
      ENABLE_JAEGER?: bool;
      JAEGER_ENDPOINT?: string;
      JAEGER_SERVICE_NAME?: string;
    }
  }
}

export {};
