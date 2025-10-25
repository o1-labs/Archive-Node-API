import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'schema.graphql',
  emitLegacyCommonJSImports: false,
  generates: {
    './src/resolvers-types.ts': {
      config: {
        contextType: './context.js#GraphQLContext',
        enumValues: {
          BlockStatusFilter: './blockchain/types.js#BlockStatusFilter',
        },
        scalars: {
          DateTime: { input: 'string', output: 'string' },
        },
      },
      plugins: ['typescript', 'typescript-resolvers'],
    },
  },
  hooks: { afterAllFileWrite: ['prettier --write'] },
};
export default config;
