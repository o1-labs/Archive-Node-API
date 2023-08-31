import type postgres from 'postgres';

import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  Action,
  Actions,
} from '../../blockchain/types';
import type { ActionFilterOptionsInput } from '../../resolvers-types';
import { DEFAULT_TOKEN_ID } from '../../blockchain/constants';
import { createBlockInfo } from '../../blockchain/utils';
import { getActionsQuery } from '../../db/sql/events-actions/queries';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from '../data-adapters/database-row-adapters';
import { IActionsService } from './actions-service.interface';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer';

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
    const { address, to, from } = input;
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
      from?.toString()
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
      const transaction = transactions.values().next().value[0];
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
        actionData: actionsData.flat(),
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
}
