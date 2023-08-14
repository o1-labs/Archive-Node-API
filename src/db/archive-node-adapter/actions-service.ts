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
    return (await this.getActionData(input)) ?? [];
  }

  async getActionData(input: ActionFilterOptionsInput): Promise<Actions> {
    // Request action zkApp info from the Archive Node Database
    this.tracingService.startSpan('Actions SQL');
    const rows = await this.executeActionsQuery(input);
    this.tracingService.endSpan();

    this.tracingService.startSpan('Actions Processing');
    // Partition the rows into a map where the keys are element ids and the values are field values.
    const elementIdFieldValues = getElementIdFieldValues(rows);
    // Partition the rows into a map where the keys are block hashes and the values are maps of transaction hashes to array of rows.
    const blocksWithTransactions = partitionBlocks(rows);
    // Map the rows into Action instances.
    const actionsData = this.blocksToActions(
      blocksWithTransactions,
      elementIdFieldValues
    );
    this.tracingService.endSpan();
    // Sort and filter the actions.
    return sortAndFilterBlocks(actionsData);
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
