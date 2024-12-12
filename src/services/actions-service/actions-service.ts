import type postgres from 'postgres';

import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  Action,
  Actions,
} from '../../blockchain/types.js';
import type { ActionFilterOptionsInput } from '../../resolvers-types.js';
import { DEFAULT_TOKEN_ID } from '../../blockchain/constants.js';
import { createBlockInfo } from '../../blockchain/utils.js';
import {
  getActionsQuery,
  checkActionState,
} from '../../db/sql/events-actions/queries.js';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from '../data-adapters/database-row-adapters.js';
import { IActionsService } from './actions-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';
import { throwActionStateError } from '../../errors/error.js';

export { ActionsService };

class ActionsService implements IActionsService {
  private readonly client: postgres.Sql;

  constructor(client: postgres.Sql) {
    this.client = client;
  }

  async getActions(
    input: ActionFilterOptionsInput,
    options: unknown
  ): Promise<Actions> {
    const tracingState = extractTraceStateFromOptions(options);
    return (await this.getActionData(input, { tracingState })) ?? [];
  }

  async getActionData(
    input: ActionFilterOptionsInput,
    { tracingState }: { tracingState: TracingState }
  ): Promise<Actions> {
    const sqlSpan = tracingState.startSpan('actions.SQL');
    const rows = await this.executeActionsQuery(input);

    sqlSpan.end();

    const processingSpan = tracingState.startSpan('actions.processing');
    const elementIdFieldValues = getElementIdFieldValues(rows);
    const blocksWithTransactions = partitionBlocks(rows);
    const actionsData = this.blocksToActions(
      blocksWithTransactions,
      elementIdFieldValues
    );
    sortAndFilterBlocks(actionsData);
    processingSpan.end();
    return actionsData;
  }

  async executeActionsQuery(input: ActionFilterOptionsInput) {
    const { address, to, from, endActionState, fromActionState } = input;

    // Check if action states exist.
    if (fromActionState) {
      const fromActionStateExists = await checkActionState(
        this.client,
        fromActionState
      );
      if (!fromActionStateExists || !fromActionStateExists.length) {
        throwActionStateError(
          `fromActionState ${fromActionState} does not exist`
        );
      }
    }
    if (endActionState) {
      const endActionStateExists = await checkActionState(
        this.client,
        endActionState
      );
      if (!endActionStateExists || !endActionStateExists.length) {
        throwActionStateError(
          `endActionState ${endActionState} does not exist`
        );
      }
    }
    let { tokenId, status } = input;

    tokenId ||= DEFAULT_TOKEN_ID;
    status ||= BlockStatusFilter.all;
    if (to && from && to < from) {
      throw new Error('to must be greater than from');
    }

    return getActionsQuery(
      this.client,
      address,
      tokenId,
      status,
      to?.toString(),
      from?.toString(),
      fromActionState?.toString(),
      endActionState?.toString()
    );
  }

  blocksToActions(
    blocksWithTransactions: BlocksWithTransactionsMap,
    elementIdFieldValues: FieldElementIdWithValueMap
  ) {
    const actions: Actions = [];
    const blockTransactionEntries = Array.from(
      blocksWithTransactions.entries()
    );
    for (let i = 0; i < blockTransactionEntries.length; i++) {
      const transactions = blockTransactionEntries[i][1];
      const transaction = transactions.values().next().value![0];
      const blockInfo = createBlockInfo(transaction);
      const {
        action_state_value1,
        action_state_value2,
        action_state_value3,
        action_state_value4,
        action_state_value5,
      } = transaction;

      const actionsData: Action[][] = [];
      for (const [, transaction] of transactions) {
        const filteredBlocks = removeRedundantEmittedFields(transaction);
        const actionData = mapActionOrEvent(
          'action',
          filteredBlocks,
          elementIdFieldValues
        ) as Action[];
        actionsData.push(actionData);
      }
      actions.push({
        blockInfo,
        actionData: this.sortActions(actionsData.flat()),
        actionState: {
          /* eslint-disable */
          actionStateOne: action_state_value1!,
          actionStateTwo: action_state_value2!,
          actionStateThree: action_state_value3!,
          actionStateFour: action_state_value4!,
          actionStateFive: action_state_value5!,
          /* eslint-enable */
        },
      });
    }
    return actions;
  }

  sortActions(actions: Action[]): Action[] {
    return actions.sort((a, b) => {
      // Sort by sequence number
      if (
        a.transactionInfo.sequenceNumber !== b.transactionInfo.sequenceNumber
      ) {
        return (
          a.transactionInfo.sequenceNumber - b.transactionInfo.sequenceNumber
        );
      }

      // Sort by account update index within the transaction
      const aAccountUpdateIndex =
        a.transactionInfo.zkappAccountUpdateIds.indexOf(
          Number(a.accountUpdateId)
        );
      const bAccountUpdateIndex =
        b.transactionInfo.zkappAccountUpdateIds.indexOf(
          Number(b.accountUpdateId)
        );

      return aAccountUpdateIndex - bAccountUpdateIndex;
    });
  }
}
