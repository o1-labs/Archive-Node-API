import { describe, test } from 'node:test';
import assert from 'node:assert';
import { GraphQLError } from 'graphql';
import {
  throwGraphQLError,
  throwActionStateError,
  throwBlockRangeError,
} from '../../src/errors/error.js';

describe('Error Handling', () => {
  describe('throwGraphQLError', () => {
    test('throws GraphQLError with message', () => {
      assert.throws(
        () => throwGraphQLError('test message'),
        (err: GraphQLError) => {
          assert.ok(err instanceof GraphQLError);
          assert.strictEqual(err.message, 'test message');
          return true;
        }
      );
    });

    test('throws GraphQLError with code and status', () => {
      assert.throws(
        () => throwGraphQLError('msg', 'MY_CODE', 422),
        (err: GraphQLError) => {
          assert.strictEqual(err.extensions.code, 'MY_CODE');
          assert.strictEqual(err.extensions.status, 422);
          return true;
        }
      );
    });

    test('throws with undefined code and status when not provided', () => {
      assert.throws(
        () => throwGraphQLError('msg'),
        (err: GraphQLError) => {
          assert.strictEqual(err.extensions.code, undefined);
          assert.strictEqual(err.extensions.status, undefined);
          return true;
        }
      );
    });
  });

  describe('throwActionStateError', () => {
    test('throws with ACTION_STATE_NOT_FOUND code and 400 status', () => {
      assert.throws(
        () => throwActionStateError('state xyz does not exist'),
        (err: GraphQLError) => {
          assert.ok(err instanceof GraphQLError);
          assert.strictEqual(err.message, 'state xyz does not exist');
          assert.strictEqual(err.extensions.code, 'ACTION_STATE_NOT_FOUND');
          assert.strictEqual(err.extensions.status, 400);
          return true;
        }
      );
    });
  });

  describe('throwBlockRangeError', () => {
    test('throws with BLOCK_RANGE_ERROR code and 400 status', () => {
      assert.throws(
        () => throwBlockRangeError('range too large'),
        (err: GraphQLError) => {
          assert.ok(err instanceof GraphQLError);
          assert.strictEqual(err.message, 'range too large');
          assert.strictEqual(err.extensions.code, 'BLOCK_RANGE_ERROR');
          assert.strictEqual(err.extensions.status, 400);
          return true;
        }
      );
    });
  });
});
