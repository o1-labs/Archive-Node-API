import postgres from 'postgres';
import {
  Action,
  Actions,
  BlockStatusFilter,
  DEFAULT_TOKEN_ID,
  Event,
  Events,
  ArchiveNodeDatabaseRow,
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
    const blocksMap = this.partitionBlocks(rows);
    const eventsData = this.deriveEventsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    eventsData.sort((a, b) => b.blockInfo.height - a.blockInfo.height);
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
    const blocksMap = this.partitionBlocks(rows);
    const actionsData = this.deriveActionsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    actionsData.sort((a, b) => b.blockInfo.height - a.blockInfo.height);
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
    blocksMap: Map<string, Map<string, ArchiveNodeDatabaseRow[]>>,
    elementIdFieldValues: Map<string, string>
  ) {
    const events: Events = [];
    const blockMapEntries = Array.from(blocksMap.entries());
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

  protected removeRedundantEmittedFields(blocks: ArchiveNodeDatabaseRow[]) {
    const newBlocks: ArchiveNodeDatabaseRow[] = [];
    const seenEventIds = new Set<number>();

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const { zkapp_event_array_id, zkapp_event_element_ids } = block;

      if (!seenEventIds.has(zkapp_event_array_id)) {
        const indicies = findAllIndexes(
          zkapp_event_element_ids,
          zkapp_event_array_id
        );
        indicies.forEach((index) => {
          newBlocks[index] = block;
        });
        seenEventIds.add(zkapp_event_array_id);
      }
    }
    return newBlocks;
  }

  protected deriveActionsFromBlocks(
    blocksMap: Map<string, Map<string, ArchiveNodeDatabaseRow[]>>,
    elementIdFieldValues: Map<string, string>
  ) {
    const actions: Actions = [];
    const blockMapEntries = Array.from(blocksMap.entries());
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
        actionData.sort(
          (a, b) => Number(a.accountUpdateId) - Number(b.accountUpdateId)
        );
        actionsData.push(actionData);
      }
      actions.push({
        blockInfo,
        actionData: actionsData.flat(),
        actionState: {
          actionStateOne: action_state_value1!,
          actionStateTwo: action_state_value2!,
          actionStateThree: action_state_value3!,
          actionStateFour: action_state_value4!,
          actionStateFive: action_state_value5!,
        },
      });
    }
    return actions;
  }

  protected partitionBlocks(rows: postgres.RowList<ArchiveNodeDatabaseRow[]>) {
    const blocks: Map<
      string,
      Map<string, ArchiveNodeDatabaseRow[]>
    > = new Map();
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

  protected mapActionOrEvent(
    kind: 'action' | 'event',
    rows: ArchiveNodeDatabaseRow[],
    elementIdFieldValues: Map<string, string>
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
    const elementIdValues: Map<string, string> = new Map();
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
