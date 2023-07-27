import type postgres from 'postgres';
import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  DEFAULT_TOKEN_ID,
  FieldElementIdWithValueMap,
  Action,
  Actions,
} from '../../models/types';
import { ActionFilterOptionsInput } from 'src/resolvers-types';
import { TracingService } from 'src/tracing/tracing';
import { getActionsQuery } from './queries';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from './utils';
import { createBlockInfo } from '../../models/utils';

export { ActionsService };

class ActionsService {
  constructor(
    private client: postgres.Sql,
    private tracingService: TracingService
  ) {
    this.client = client;
    this.tracingService = tracingService;
  }

  async getActions(input: ActionFilterOptionsInput): Promise<Actions> {
    let actionsData = await this.getActionData(input);
    actionsData = sortAndFilterBlocks(actionsData);
    return actionsData ?? [];
  }

  async getActionData(input: ActionFilterOptionsInput): Promise<Actions> {
    this.tracingService.startSpan('Actions SQL');
    const rows = await this.executeActionsQuery(input);
    this.tracingService.endSpan();

    this.tracingService.startSpan('Actions Processing');
    const elementIdFieldValues = getElementIdFieldValues(rows);
    const blocksWithTransactions = partitionBlocks(rows);
    const actionsData = this.deriveActionsFromBlocks(
      blocksWithTransactions,
      elementIdFieldValues
    );
    this.tracingService.endSpan();
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

  deriveActionsFromBlocks(
    blocksWithTransactions: BlocksWithTransactionsMap,
    elementIdFieldValues: FieldElementIdWithValueMap
  ) {
    const actions: Actions = [];
    const blockMapEntries = Array.from(blocksWithTransactions.entries());
    for (let i = 0; i < blockMapEntries.length; i++) {
      const transactions = blockMapEntries[i][1];
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
