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
    eventsData.sort(
      (a, b) => Number(b.blockInfo.height) - Number(a.blockInfo.height)
    );
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
    actionsData.sort(
      (a, b) => Number(b.blockInfo.height) - Number(a.blockInfo.height)
    );
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
    const { address, to, from, fromActionHash, endActionHash } = input;
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
      fromActionHash?.toString(),
      endActionHash?.toString()
    );
  }

  protected deriveEventsFromBlocks(
    blocksMap: Map<string, ArchiveNodeDatabaseRow[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    const eventsData: Events = [];
    for (const [, blocks] of blocksMap) {
      const blockInfo = createBlockInfo(blocks[0]);
      const transactionInfo = createTransactionInfo(blocks[0]);
      const filteredBlocks = this.removeRedundantEmittedFields(blocks);
      const events = this.mapActionOrEvent(
        'event',
        filteredBlocks,
        elementIdFieldValues
      ) as Event[];
      if (events.every((event) => event.data.length >= 2)) {
        events.sort((a, b) => Number(a.data[0]) - Number(b.data[0]));
      }
      eventsData.push({ blockInfo, transactionInfo, eventData: events });
    }
    return eventsData;
  }

  protected removeRedundantEmittedFields(blocks: ArchiveNodeDatabaseRow[]) {
    const seenEventIds = new Map<string, number>();
    const newBlocks: ArchiveNodeDatabaseRow[] = [];

    for (const block of blocks) {
      const { element_ids, zkapp_event_element_ids } = block;
      const uniqueElementIds = [...new Set(element_ids)];
      const uniqueElementIdsKey = uniqueElementIds.join(',');
      const numberOfUniqueElements = seenEventIds.get(uniqueElementIdsKey);

      if (numberOfUniqueElements) {
        // If we have seen all the element ids before, we can remove the row.
        if (numberOfUniqueElements + 1 === uniqueElementIds.length) {
          seenEventIds.delete(uniqueElementIdsKey);
        } else {
          seenEventIds.set(uniqueElementIdsKey, numberOfUniqueElements + 1);
        }
        continue;
      }

      // If all the element ids are the same, there will only be one returned row, so we do not have to do any filtering.
      // Otherwise, if the element ids have some unique values, we need to filter out the duplicate rows.
      if (uniqueElementIds.length > 1) {
        seenEventIds.set(uniqueElementIdsKey, 1);
      }

      // Events/Actions that are emitted with the same field multiple times will only have a single value for `element_ids`.
      // Here, we check `zkapp_event_element_ids` have the same value repeated multiple times, meaning that the same event value was emitted multiple times and should be added
      const uniqueEventElementIds = new Set(zkapp_event_element_ids);
      if (uniqueEventElementIds.size === 1) {
        zkapp_event_element_ids.forEach(() => {
          newBlocks.push(block);
        });
      } else {
        newBlocks.push(block);
      }
    }

    return newBlocks;
  }

  protected deriveActionsFromBlocks(
    blocksMap: Map<string, ArchiveNodeDatabaseRow[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    const actionsData: Actions = [];
    for (const [, blocks] of blocksMap) {
      const {
        action_state_value1,
        action_state_value2,
        action_state_value3,
        action_state_value4,
        action_state_value5,
      } = blocks[0];
      const blockInfo = createBlockInfo(blocks[0]);
      const transactionInfo = createTransactionInfo(blocks[0]);
      const filteredBlocks = this.removeRedundantEmittedFields(blocks);
      const actions = this.mapActionOrEvent(
        'action',
        filteredBlocks,
        elementIdFieldValues
      ) as Action[];
      actionsData.push({
        blockInfo,
        transactionInfo,
        actionData: actions,
        actionState: {
          actionStateOne: action_state_value1!,
          actionStateTwo: action_state_value2!,
          actionStateThree: action_state_value3!,
          actionStateFour: action_state_value4!,
          actionStateFive: action_state_value5!,
        },
      });
    }
    return actionsData;
  }

  protected partitionBlocks(rows: postgres.RowList<ArchiveNodeDatabaseRow[]>) {
    const blocks: Map<string, ArchiveNodeDatabaseRow[]> = new Map();
    if (rows.length === 0) return blocks;

    for (let i = 0; i < rows.length; i++) {
      const blockHash = rows[i].state_hash;
      let blockData = blocks.get(blockHash);

      if (blockData === undefined) {
        blockData = [];
        blocks.set(blockHash, blockData);
      }
      blockData.push(rows[i]);
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
        const event = createEvent(currentValue);
        data.push(event);
      } else {
        const { zkapp_account_update_id } = rows[i];
        const action = createAction(
          zkapp_account_update_id.toString(),
          currentValue
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
