import postgres from 'postgres';
import {
  Action,
  Actions,
  BlockStatusFilter,
  defaultTokenID,
  Event,
  Events,
} from '../../models/types';
import {
  createBlockInfo,
  createTransactionInfo,
  createEvent,
  createAction,
} from '../../models/utils';
import { getActionsQuery, getEventsQuery } from './queries';

import type { DatabaseAdapter } from '../index';
import type { EventFilterOptionsInput } from '../../resolvers-types';

export class ArchiveNodeAdapter implements DatabaseAdapter {
  private client: postgres.Sql;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString);
  }

  async close() {
    return this.client.end();
  }

  async getEvents(input: EventFilterOptionsInput): Promise<Events> {
    const rows = await this.executeEventsQuery(input);

    const elementIdFieldValues = this.getElementIdFieldValues(rows);
    const blocksMap = this.partitionBlocks(rows);

    const eventsData = this.deriveEventsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    return eventsData ?? [];
  }

  async getActions(input: EventFilterOptionsInput): Promise<Actions> {
    const rows = await this.executeActionsQuery(input);

    const elementIdFieldValues = this.getElementIdFieldValues(rows);
    const blocksMap = this.partitionBlocks(rows);

    const actionsData = this.deriveActionsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    return actionsData ?? [];
  }

  private async executeEventsQuery(input: EventFilterOptionsInput) {
    const { address, to, from } = input;
    let { tokenId, status } = input;

    tokenId ||= defaultTokenID;
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

  private async executeActionsQuery(input: EventFilterOptionsInput) {
    const { address, to, from } = input;
    let { tokenId, status } = input;

    tokenId ||= defaultTokenID;
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

  protected deriveEventsFromBlocks(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    const eventsData: Events = [];
    for (const [, blocks] of blocksMap) {
      const blockInfo = createBlockInfo(blocks[0]);
      const transactionInfo = createTransactionInfo(blocks[0]);
      const events = this.mapActionOrEvent(
        'event',
        blocks,
        elementIdFieldValues
      ) as Event[];

      events.sort((a, b) => Number(a.index) - Number(b.index));
      eventsData.push({ blockInfo, transactionInfo, eventData: events });
    }
    return eventsData;
  }

  protected deriveActionsFromBlocks(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    const actionsData: Actions = [];
    for (const [, blocks] of blocksMap) {
      const blockInfo = createBlockInfo(blocks[0]);
      const transactionInfo = createTransactionInfo(blocks[0]);
      const actions = this.mapActionOrEvent(
        'action',
        blocks,
        elementIdFieldValues
      ) as Action[];

      actions.reverse();
      actionsData.push({ blockInfo, transactionInfo, actionData: actions });
    }
    return actionsData;
  }

  protected partitionBlocks(rows: postgres.RowList<postgres.Row[]>) {
    const blocks: Map<string, postgres.Row[]> = new Map();
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
    rows: postgres.Row[],
    elementIdFieldValues: Map<string, string>
  ) {
    const data: (Event | Action)[] = [];
    const seenEventOrActionIds = new Set();

    for (let i = 0; i < rows.length; i++) {
      const { element_ids } = rows[i];
      const index = element_ids[0];
      if (seenEventOrActionIds.has(index)) continue;
      seenEventOrActionIds.add(index);

      const currentValue = [];
      for (const elementId of element_ids) {
        const elementIdValue = elementIdFieldValues.get(elementId);
        if (elementIdValue === undefined) continue;
        currentValue.push(elementIdValue);
      }

      if (kind === 'event') {
        const event = createEvent(currentValue[0], currentValue.slice(1));
        data.push(event);
      } else {
        const action = createAction(currentValue);
        data.push(action);
      }
    }
    return data;
  }

  protected getElementIdFieldValues(rows: postgres.RowList<postgres.Row[]>) {
    const elementIdValues: Map<string, string> = new Map();
    for (let i = 0; i < rows.length; i++) {
      const { id, field } = rows[i];
      elementIdValues.set(id, field);
    }
    return elementIdValues;
  }
}
