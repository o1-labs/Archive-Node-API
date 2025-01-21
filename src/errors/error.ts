import { GraphQLError } from 'graphql';

export { throwGraphQLError, throwActionStateError, throwBlockRangeError };

function throwGraphQLError(message: string, code?: string, status?: number) {
  throw new GraphQLError(message, {
    extensions: {
      code,
      status,
    },
  });
}

function throwActionStateError(message: string) {
  throwGraphQLError(message, 'ACTION_STATE_NOT_FOUND', 400);
}

function throwBlockRangeError(message: string) {
  throwGraphQLError(message, 'BLOCK_RANGE_ERROR', 400);
}
