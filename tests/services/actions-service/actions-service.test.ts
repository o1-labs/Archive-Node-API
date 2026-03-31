import { test, before, describe, after } from 'node:test';
import assert from 'node:assert';
import { ActionsService } from '../../../src/services/actions-service/actions-service.js';
import { Action } from '../../../src/blockchain/types.js';
import { makeClient } from '../../test-helpers.js';

describe('ActionsService', () => {
  let actionsService: ActionsService;

  before(() => {
    actionsService = new ActionsService(makeClient());
  });

  describe('sortActions', () => {
    let actions: Action[];
    describe('with actions with different sequence numbers', () => {
      before(() => {
        actions = [
          dummyAction({ sequenceNumber: 2 }),
          dummyAction({ sequenceNumber: 1 }),
        ];
      });
      test('it sorts actions by their sequence number', () => {
        const sortedActions = actionsService.sortActions(actions);
        assert.strictEqual(sortedActions[0].transactionInfo.sequenceNumber, 1);
        assert.strictEqual(sortedActions[1].transactionInfo.sequenceNumber, 2);
      });
    });
    describe('with actions with the same sequence number', () => {
      const sequenceNumber = 1;
      describe('with actions with different account update ids', () => {
        const zkappAccountUpdateIds = [1, 2];
        before(() => {
          actions = [
            dummyAction({
              sequenceNumber,
              zkappAccountUpdateIds,
              accountUpdateId: '2',
            }),
            dummyAction({
              sequenceNumber,
              zkappAccountUpdateIds,
              accountUpdateId: '1',
            }),
          ];
        });
        test('it sorts actions by their account update index', () => {
          const sortedActions = actionsService.sortActions(actions);
          assert.strictEqual(sortedActions[0].accountUpdateId, '1');
          assert.strictEqual(sortedActions[1].accountUpdateId, '2');
        });
      });
      describe('with account update ids that are ordered in non-ascending or descending order', () => {
        const zkappAccountUpdateIds = [1, 3, 2];
        before(() => {
          actions = [
            dummyAction({
              sequenceNumber,
              zkappAccountUpdateIds,
              accountUpdateId: '2',
            }),
            dummyAction({
              sequenceNumber,
              zkappAccountUpdateIds,
              accountUpdateId: '1',
            }),
            dummyAction({
              sequenceNumber,
              zkappAccountUpdateIds,
              accountUpdateId: '3',
            }),
          ];
        });
        test('it sorts actions by their account update index', () => {
          const sortedActions = actionsService.sortActions(actions);
          assert.strictEqual(sortedActions[0].accountUpdateId, '1');
          assert.strictEqual(sortedActions[1].accountUpdateId, '3');
          assert.strictEqual(sortedActions[2].accountUpdateId, '2');
        });
      });
    });

    test('it sorts by sequence number ascending with three items', () => {
      const actions = [
        dummyAction({ sequenceNumber: 3 }),
        dummyAction({ sequenceNumber: 1 }),
        dummyAction({ sequenceNumber: 2 }),
      ];
      const sorted = actionsService.sortActions(actions);
      assert.strictEqual(sorted[0].transactionInfo.sequenceNumber, 1);
      assert.strictEqual(sorted[1].transactionInfo.sequenceNumber, 2);
      assert.strictEqual(sorted[2].transactionInfo.sequenceNumber, 3);
    });

    test('it handles mixed sequence numbers and account update indices', () => {
      const ids = [1, 2];
      const actions = [
        dummyAction({ sequenceNumber: 2, accountUpdateId: '2', zkappAccountUpdateIds: ids }),
        dummyAction({ sequenceNumber: 1, accountUpdateId: '2', zkappAccountUpdateIds: ids }),
        dummyAction({ sequenceNumber: 1, accountUpdateId: '1', zkappAccountUpdateIds: ids }),
        dummyAction({ sequenceNumber: 2, accountUpdateId: '1', zkappAccountUpdateIds: ids }),
      ];
      const sorted = actionsService.sortActions(actions);
      assert.strictEqual(sorted[0].transactionInfo.sequenceNumber, 1);
      assert.strictEqual(sorted[0].accountUpdateId, '1');
      assert.strictEqual(sorted[1].transactionInfo.sequenceNumber, 1);
      assert.strictEqual(sorted[1].accountUpdateId, '2');
      assert.strictEqual(sorted[2].transactionInfo.sequenceNumber, 2);
      assert.strictEqual(sorted[2].accountUpdateId, '1');
      assert.strictEqual(sorted[3].transactionInfo.sequenceNumber, 2);
      assert.strictEqual(sorted[3].accountUpdateId, '2');
    });

    test('it returns empty array for empty input', () => {
      assert.strictEqual(actionsService.sortActions([]).length, 0);
    });

    test('it handles account update id not in the list', () => {
      const actions = [
        dummyAction({ sequenceNumber: 1, accountUpdateId: '99', zkappAccountUpdateIds: [1, 2] }),
        dummyAction({ sequenceNumber: 1, accountUpdateId: '1', zkappAccountUpdateIds: [1, 2] }),
      ];
      const sorted = actionsService.sortActions(actions);
      // accountUpdateId 99 not in [1,2] → indexOf returns -1, sorts before index 0
      assert.strictEqual(sorted[0].accountUpdateId, '99');
      assert.strictEqual(sorted[1].accountUpdateId, '1');
    });
  });
});

function dummyAction({
  sequenceNumber = 1,
  accountUpdateId = '1',
  zkappAccountUpdateIds = [1],
}: {
  sequenceNumber?: number;
  accountUpdateId?: string;
  eventElementId?: string;
  zkappAccountUpdateIds?: number[];
}): Action {
  return {
    accountUpdateId,
    data: ['dummy'],
    transactionInfo: {
      sequenceNumber,
      zkappAccountUpdateIds,
      authorizationKind: 'dummy',
      hash: 'dummy',
      memo: 'dummy',
      status: 'dummy',
    },
  };
}
