import postgres from 'postgres';
import {
  Action,
  Actions,
  BlockStatusFilter,
  DEFAULT_TOKEN_ID,
  Event,
  Events,
  ArchiveNodeDatabaseRow,
  BlockInfo,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
} from '../../models/types';
import {
  createBlockInfo,
  createTransactionInfo,
  createEvent,
  createAction,
} from '../../models/utils';
import {
  getActionsQuery,
  getEventsQuery,
  getTables,
  USED_TABLES,
} from './queries';

import type { DatabaseAdapter } from '../index';
import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
} from '../../resolvers-types';
import { TraceInfo } from 'src/tracing';

import { blake2bHex } from 'blakejs';

export class ArchiveNodeAdapter implements DatabaseAdapter {
  private client: postgres.Sql;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString);
  }

  async checkSQLSchema() {
    let tables;
    try {
      tables = await (
        await getTables(this.client)
      ).map((table) => table.tablename);
    } catch (e) {
      throw new Error(
        `Could not connect to Postgres with the specified connection string. Please check that Postgres is available and that your connection string is correct and try again.\nReason: ${e}`
      );
    }

    for (const table of USED_TABLES) {
      if (!tables.includes(table)) {
        throw new Error(
          `Missing table ${table}. Please make sure the table exists in the database.`
        );
      }
    }
  }

  async close() {
    return this.client.end();
  }

  async getEvents(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Events> {
    let traceInfo;
    if (options && typeof options === 'object' && 'traceInfo' in options) {
      traceInfo = options.traceInfo as TraceInfo;
    }

    const sqlSpan = traceInfo?.tracer.startSpan(
      'Events SQL',
      undefined,
      traceInfo.ctx
    );
    const rows = await this.executeEventsQuery(input);
    sqlSpan?.end();

    const eventsProcessingSpan = traceInfo?.tracer.startSpan(
      'Events Processing',
      undefined,
      traceInfo.ctx
    );
    const elementIdFieldValues = this.getElementIdFieldValues(rows);
    const blocksWithTransactions = this.partitionBlocks(rows);
    const eventsData = this.deriveEventsFromBlocks(
      blocksWithTransactions,
      elementIdFieldValues
    );
    eventsData.sort((a, b) => b.blockInfo.height - a.blockInfo.height);
    filterBestTip(eventsData);

    eventsProcessingSpan?.end();
    return eventsData ?? [];
  }

  async getActions(
    input: EventFilterOptionsInput,
    options: unknown
  ): Promise<Actions> {
    let traceInfo;
    if (options && typeof options === 'object' && 'traceInfo' in options) {
      traceInfo = options.traceInfo as TraceInfo;
    }

    const sqlSpan = traceInfo?.tracer.startSpan(
      'Actions SQL',
      undefined,
      traceInfo.ctx
    );
    const rows = await this.executeActionsQuery(input);
    sqlSpan?.end();

    const actionsProcessingSpan = traceInfo?.tracer.startSpan(
      'Actions Processing',
      undefined,
      traceInfo.ctx
    );
    const elementIdFieldValues = this.getElementIdFieldValues(rows);
    const blocksWithTransactions = this.partitionBlocks(rows);
    const actionsData = this.deriveActionsFromBlocks(
      blocksWithTransactions,
      elementIdFieldValues
    );
    actionsData.sort((a, b) => b.blockInfo.height - a.blockInfo.height);
    filterBestTip(actionsData);
    actionsProcessingSpan?.end();
    return actionsData ?? [];
  }

  private async executeEventsQuery(input: EventFilterOptionsInput) {
    const { address, to, from } = input;
    let { tokenId, status } = input;

    tokenId ||= DEFAULT_TOKEN_ID;
    status ||= BlockStatusFilter.all;
    if (to && from && to < from) {
      throw new Error('to must be greater than from');
    }

    return getEventsQuery(
      this.client,
      address,
      tokenId,
      status,
      to?.toString(),
      from?.toString()
    );
  }

  private async executeActionsQuery(input: ActionFilterOptionsInput) {
    const { address, to, from, fromActionState, endActionState } = input;
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

  protected deriveEventsFromBlocks(
    blocksWithTransactions: BlocksWithTransactionsMap,
    elementIdFieldValues: FieldElementIdWithValueMap
  ) {
    const events: Events = [];
    const blockMapEntries = Array.from(blocksWithTransactions.entries());
    for (let i = 0; i < blockMapEntries.length; i++) {
      const transactions = blockMapEntries[i][1];
      const transaction = transactions.values().next().value[0];
      const blockInfo = createBlockInfo(transaction);

      const eventsData: Event[][] = [];
      for (const [, transaction] of transactions) {
        const filteredBlocks = this.removeRedundantEmittedFields(transaction);
        const eventData = this.mapActionOrEvent(
          'event',
          filteredBlocks,
          elementIdFieldValues
        ) as Event[];
        eventsData.push(eventData);
      }
      events.push({
        blockInfo,
        eventData: eventsData.flat(),
      });
    }
    return events;
  }

  protected deriveActionsFromBlocks(
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
        const filteredBlocks = this.removeRedundantEmittedFields(transaction);
        const actionData = this.mapActionOrEvent(
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

  protected partitionBlocks(rows: postgres.RowList<ArchiveNodeDatabaseRow[]>) {
    const blocks: BlocksWithTransactionsMap = new Map();
    if (rows.length === 0) return blocks;

    for (let i = 0; i < rows.length; i++) {
      const { state_hash: blockHash, hash: transactionHash } = rows[i];
      const blockData = blocks.get(blockHash);

      if (blockData === undefined) {
        const firstEntry = new Map();
        firstEntry.set(transactionHash, [rows[i]]);
        blocks.set(blockHash, firstEntry);
      } else {
        const blockDataRows = blockData.get(transactionHash);
        if (blockDataRows) {
          blockDataRows.push(rows[i]);
        } else {
          blockData.set(transactionHash, [rows[i]]);
        }
      }
    }
    return blocks;
  }

  protected removeRedundantEmittedFields(blocks: ArchiveNodeDatabaseRow[]) {
    const newBlocks: ArchiveNodeDatabaseRow[][] = [];
    const seenEventIds = new Set<string>();

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const {
        zkapp_event_array_id,
        zkapp_event_element_ids,
        zkapp_account_update_id,
        zkapp_account_updates_ids,
      } = block;
      const uniqueId = [zkapp_account_update_id, zkapp_event_array_id].join(
        ','
      );
      if (!seenEventIds.has(uniqueId)) {
        const accountUpdateIndexes = findAllIndexes(
          zkapp_account_updates_ids,
          zkapp_account_update_id
        );
        if (accountUpdateIndexes.length === 0) {
          throw new Error(
            `No matching account update found for the given account update ID (${zkapp_account_update_id}) and event array ID (${zkapp_event_array_id}).`
          );
        }
        // AccountUpdate Ids are always unique so we can assume it will return an array with one element
        const accountUpdateIdIndex = accountUpdateIndexes[0];
        const eventIndexes = findAllIndexes(
          zkapp_event_element_ids,
          zkapp_event_array_id
        );

        eventIndexes.forEach((index) => {
          if (newBlocks[accountUpdateIdIndex] === undefined) {
            newBlocks[accountUpdateIdIndex] = [];
          }
          newBlocks[accountUpdateIdIndex][index] = block;
        });
        seenEventIds.add(uniqueId);
      }
    }
    return newBlocks.flat();
  }

  protected mapActionOrEvent(
    kind: 'action' | 'event',
    rows: ArchiveNodeDatabaseRow[],
    elementIdFieldValues: FieldElementIdWithValueMap
  ) {
    const data: (Event | Action)[] = [];

    for (let i = 0; i < rows.length; i++) {
      const { element_ids } = rows[i];
      const currentValue = [];
      for (const elementId of element_ids) {
        const elementIdValue = elementIdFieldValues.get(elementId.toString());
        if (elementIdValue === undefined) continue;
        currentValue.push(elementIdValue);
      }

      if (kind === 'event') {
        const transactionInfo = createTransactionInfo(rows[i]);
        const event = createEvent(currentValue, transactionInfo);
        data.push(event);
      } else {
        const { zkapp_account_update_id } = rows[i];
        const transactionInfo = createTransactionInfo(rows[i]);
        const action = createAction(
          zkapp_account_update_id.toString(),
          currentValue,
          transactionInfo
        );
        data.push(action);
      }
    }
    return data;
  }

  protected getElementIdFieldValues(rows: ArchiveNodeDatabaseRow[]) {
    const elementIdValues: FieldElementIdWithValueMap = new Map();
    for (let i = 0; i < rows.length; i++) {
      const { id, field } = rows[i];
      elementIdValues.set(id.toString(), field);
    }
    return elementIdValues;
  }
}

function findAllIndexes<T>(arr: T[], target: T): number[] {
  const indexes: number[] = [];
  arr.forEach((element, index) => {
    if (element === target) {
      indexes.push(index);
    }
  });
  return indexes;
}

function findLastIndexPredicate<T>(array: T[], predicate: (arg: T) => boolean) {
  for (let i = 0; i < array.length; i++) {
    console.log(array[i], predicate(array[i]));
    if (
      predicate(array[i]) &&
      i < array.length - 1 &&
      !predicate(array[i + 1])
    ) {
      return i;
    }
  }
  return -1;
}

function getAllPredicate<T>(array: T[], predicate: (arg: T) => boolean) {
  const data: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      data.push(array[i]);
    } else {
      break;
    }
  }
  return data;
}

function filterBestTip<T extends { blockInfo: BlockInfo }>(
  eventOrActionData: T[]
) {
  const highestTipBlocks = getAllPredicate(
    eventOrActionData,
    (e) => e.blockInfo.distanceFromMaxBlockHeight === 0
  );
  if (highestTipBlocks.length > 1) {
    const index = findLastIndexPredicate(
      eventOrActionData,
      (event) => event.blockInfo.distanceFromMaxBlockHeight === 0
    );
    if (index === -1) {
      return eventOrActionData;
    }
    const selectedTip = chainSelect(highestTipBlocks);
    eventOrActionData.splice(0, index + 1);
    eventOrActionData.unshift(selectedTip);
  }
}

function chainSelect<T extends { blockInfo: BlockInfo }>(blocks: T[]) {
  if (blocks.length === 1) return blocks[0];
  let existing = blocks[0];
  for (let i = 1; i < blocks.length; i++) {
    const candidate = blocks[i];
    existing = select(existing, candidate);
  }
  return existing;
}

/**
 * This function is used to select the best chain based on the tie breaker rules that the Mina Protocol uses.
 *
 * The tie breaker rules are as follows:
 * 1. Take the block with the highest VRF output, denoted by comparing the VRF Blake2B hashes.
 *  - https://github.com/MinaProtocol/mina/blob/bff1e117ae4740fa51d12b32736c6c63d7909bd1/src/lib/consensus/proof_of_stake.ml#L3004
 * 2. If the VRF outputs are equal, take the block with the highest state hash.
 *  - https://github.com/MinaProtocol/mina/blob/bff1e117ae4740fa51d12b32736c6c63d7909bd1/src/lib/consensus/proof_of_stake.ml#L3001
 *
 * The tie breaker rules are also more formally documented here: https://github.com/MinaProtocol/mina/blob/36d39cd0b2e3ba6c5e687770a5c683984ca587fc/docs/specs/consensus/README.md?plain=1#L1134
 */

function select<T extends { blockInfo: BlockInfo }>(existing: T, candidate: T) {
  const existingVRFHash = blake2bHex(existing.blockInfo.lastVrfOutput);
  const candidateVRFHash = blake2bHex(candidate.blockInfo.lastVrfOutput);
  if (existingVRFHash > candidateVRFHash) {
    return existing;
  } else if (existingVRFHash < candidateVRFHash) {
    return candidate;
  }

  const existingHash = existing.blockInfo.stateHash;
  const candidateHash = candidate.blockInfo.stateHash;
  if (existingHash > candidateHash) {
    return existing;
  } else if (existingHash < candidateHash) {
    return candidate;
  }

  return existing;
}
