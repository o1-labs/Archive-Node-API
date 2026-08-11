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
  resolveActionStateBoundary,
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
import {
  throwActionStateError,
  throwActionStateOutOfRangeError,
  throwBlockRangeError,
} from '../../errors/error.js';
import { BLOCK_RANGE_SIZE } from '../../server/server.js';

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

  /**
   * Resolves an action state to the block height at which this account's action
   * state first became that value, and raises a typed error when the request
   * cannot be answered completely.
   *
   * The filter has to use a position on the chain. It used to compare
   * `zkapp_field.id`, the interning key of the value, which records when a value
   * was first written to the archive and not where it sits on the chain. Those
   * two orders disagree on any archive that was filled out of chain order, and
   * the filter then dropped real actions.
   */
  async resolveBoundaryHeight(
    argumentName: 'fromActionState' | 'endActionState',
    actionState: string,
    address: string,
    tokenId: string,
    from?: number,
    to?: number
  ): Promise<string | undefined> {
    const [boundary] = await resolveActionStateBoundary(
      this.client,
      address,
      tokenId,
      actionState,
      from?.toString(),
      to?.toString()
    );

    if (!boundary || boundary.boundary_height === null) {
      throwActionStateError(
        `${argumentName} ${actionState} is not an action state of account ${address}`
      );
      return undefined;
    }

    const boundaryHeight = Number(boundary.boundary_height);
    const windowStart = Number(boundary.window_start);

    // The checkpoint is older than the block range this query covers. For
    // `fromActionState` that alone does not make the answer wrong: if the account
    // emitted no action between the checkpoint and the start of the window, every
    // action in the window is still the complete answer, and
    // `state_entering_window` says so. Rejecting in that case would break the
    // common case of a quiet zkApp folding from its genesis action state, which
    // is the default o1js path because o1js sends no `from`/`to`.
    //
    // `endActionState` gets no such rescue. It bounds the request from above, so
    // a checkpoint below the window means the whole requested span is below the
    // window and every action in it is missing. An empty answer would be silently
    // wrong, which is the failure this change exists to remove.
    const answerIsStillComplete =
      argumentName === 'fromActionState' && boundary.state_entering_window === true;
    if (boundaryHeight < windowStart && !answerIsStillComplete) {
      throwActionStateOutOfRangeError(
        `${argumentName} ${actionState} is at block height ${boundaryHeight}, which is below the ` +
          `queried block range starting at ${windowStart}, and this account emitted actions in ` +
          `between. The answer would be missing them. Retry with from: ${boundaryHeight} ` +
          `(at most ${BLOCK_RANGE_SIZE} blocks per query, so paginate if needed).`
      );
    }

    return boundary.boundary_height;
  }

  async executeActionsQuery(input: ActionFilterOptionsInput) {
    const { address, to, from, endActionState, fromActionState } = input;

    let { tokenId, status } = input;

    tokenId ||= DEFAULT_TOKEN_ID;
    status ||= BlockStatusFilter.all;
    if (to && from && to < from) {
      throwBlockRangeError('to must be greater than from');
    }
    if (to && from && to - from > BLOCK_RANGE_SIZE) {
      throwBlockRangeError(
        `The block range is too large. The maximum range is ${BLOCK_RANGE_SIZE}`
      );
    }

    const fromActionStateHeight = fromActionState
      ? await this.resolveBoundaryHeight(
          'fromActionState',
          fromActionState.toString(),
          address,
          tokenId,
          from ?? undefined,
          to ?? undefined
        )
      : undefined;
    const endActionStateHeight = endActionState
      ? await this.resolveBoundaryHeight(
          'endActionState',
          endActionState.toString(),
          address,
          tokenId,
          from ?? undefined,
          to ?? undefined
        )
      : undefined;

    return getActionsQuery(
      this.client,
      address,
      tokenId,
      status,
      to?.toString(),
      from?.toString(),
      fromActionStateHeight,
      endActionStateHeight
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
