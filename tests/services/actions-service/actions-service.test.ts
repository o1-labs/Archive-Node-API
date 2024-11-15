import { test, before, describe, after } from 'node:test';
import assert from 'node:assert';
import { ActionsService } from '../../../src/services/actions-service/actions-service.js';
import { Sql } from 'postgres';
import { Action } from '../../../src/blockchain/types.js';

describe('ActionsService', () => {
  let actionsService: ActionsService;

  before(() => {
    const client = {
      query: () => {},
      CLOSE: () => {},
      END: () => {},
      PostgresError: class {},
      options: {},
    } as unknown as Sql<{}>;
    actionsService = new ActionsService(client);
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
      describe('with actions with the same account update id', () => {
        const accountUpdateId = '1';
        const zkappAccountUpdateIds = [1];
        describe('with actions with different event element ids', () => {
          const zkappEventElementIds = [1, 3, 2];
          before(() => {
            actions = [
              dummyAction({
                sequenceNumber,
                accountUpdateId,
                zkappAccountUpdateIds,
                zkappEventElementIds,
                eventElementId: '2',
              }),
              dummyAction({
                sequenceNumber,
                accountUpdateId,
                zkappAccountUpdateIds,
                zkappEventElementIds,
                eventElementId: '1',
              }),
              dummyAction({
                sequenceNumber,
                accountUpdateId,
                zkappAccountUpdateIds,
                zkappEventElementIds,
                eventElementId: '3',
              }),
            ];
          });

          test('it sorts actions by their event element index', () => {
            const sortedActions = actionsService.sortActions(actions);
            assert.strictEqual(sortedActions[0].eventElementId, '1');
            assert.strictEqual(sortedActions[1].eventElementId, '3');
            assert.strictEqual(sortedActions[2].eventElementId, '2');
          });
        });
      });
    });
  });
});

function dummyAction({
  sequenceNumber = 1,
  accountUpdateId = '1',
  eventElementId = '1',
  zkappAccountUpdateIds = [1],
  zkappEventElementIds = [1],
}: {
  sequenceNumber?: number;
  accountUpdateId?: string;
  eventElementId?: string;
  zkappAccountUpdateIds?: number[];
  zkappEventElementIds?: number[];
}): Action {
  return {
    accountUpdateId,
    eventElementId,
    data: ['dummy'],
    transactionInfo: {
      sequenceNumber,
      zkappAccountUpdateIds,
      zkappEventElementIds,
      authorizationKind: 'dummy',
      hash: 'dummy',
      memo: 'dummy',
      status: 'dummy',
    },
  };
}
