import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema.ts',
  generates: {
    './src/resolvers-types.ts': {
      config: {
        contextType: './context#GraphQLContext',
        enumValues: {
          BlockStatusFilter: './models/types#BlockStatusFilter',
        },
      },
      plugins: ['typescript', 'typescript-resolvers'],
    },
  },
  hooks: { afterAllFileWrite: ['prettier --write'] },
};
export default config;
