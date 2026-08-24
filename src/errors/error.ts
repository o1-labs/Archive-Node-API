import { GraphQLError } from 'graphql';

export {
  throwGraphQLError,
  throwActionStateError,
  throwActionStateOutOfRangeError,
  throwBlockRangeError,
};

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

/**
 * The action state is a real action state of the requested account, but it sits
 * below the block range this query covers, and the account emitted actions in
 * between. Any list we could return would be missing those actions. Returning it
 * silently is what makes a client fold a wrong action state, so this is an error
 * and not a truncated answer.
 */
function throwActionStateOutOfRangeError(message: string) {
  throwGraphQLError(message, 'ACTION_STATE_OUT_OF_RANGE', 400);
}

function throwBlockRangeError(message: string) {
  throwGraphQLError(message, 'BLOCK_RANGE_ERROR', 400);
}
