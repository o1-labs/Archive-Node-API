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
    if (!connectionString) throw new Error('Missing connection string');
    this.client = postgres(connectionString);
  }

  async close() {
    return this.client.end();
  }

  async getEvents(input: EventFilterOptionsInput): Promise<Events> {
    let rows = await this.executeEventsQuery(input);

    let elementIdFieldValues = this.getElementIdFieldValues(rows);
    let blocksMap = this.partitionBlocks(rows);

    let eventsData = this.deriveEventsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    return eventsData ?? [];
  }

  async getActions(input: EventFilterOptionsInput): Promise<Actions> {
    let rows = await this.executeActionsQuery(input);

    let elementIdFieldValues = this.getElementIdFieldValues(rows);
    let blocksMap = this.partitionBlocks(rows);

    let actionsData = this.deriveActionsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    return actionsData ?? [];
  }

  private async executeEventsQuery(input: EventFilterOptionsInput) {
    let { address, tokenId, status, to, from } = input;
    tokenId ??= defaultTokenID;
    status ??= BlockStatusFilter.all;
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
    let { address, tokenId, status, to, from } = input;
    tokenId ??= defaultTokenID;
    status ??= BlockStatusFilter.all;
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

  private deriveEventsFromBlocks(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    let eventsData: Events = [];
    for (let [_, blocks] of blocksMap) {
      let blockInfo = createBlockInfo(blocks[0]);
      let transactionInfo = createTransactionInfo(blocks[0]);
      let events = this.mapActionOrEvent(
        'event',
        blocks,
        elementIdFieldValues
      ) as Event[];

      events.reverse();
      eventsData.push({ blockInfo, transactionInfo, eventData: events });
    }
    return eventsData;
  }

  private deriveActionsFromBlocks(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    let actionsData: Actions = [];
    for (let [_, blocks] of blocksMap) {
      let blockInfo = createBlockInfo(blocks[0]);
      let transactionInfo = createTransactionInfo(blocks[0]);
      let actions = this.mapActionOrEvent(
        'action',
        blocks,
        elementIdFieldValues
      ) as Action[];

      actions.reverse();
      actionsData.push({ blockInfo, transactionInfo, actionData: actions });
    }
    return actionsData;
  }

  private partitionBlocks(rows: postgres.RowList<postgres.Row[]>) {
    let blocks: Map<string, postgres.Row[]> = new Map();
    if (rows.length === 0) return blocks;

    for (let i = 0; i < rows.length; i++) {
      let blockHash = rows[i].state_hash;
      let blockData = blocks.get(blockHash);

      if (blockData === undefined) {
        blockData = [];
        blocks.set(blockHash, blockData);
      }
      blockData.push(rows[i]);
    }
    return blocks;
  }

  private mapActionOrEvent(
    kind: 'action' | 'event',
    rows: postgres.Row[],
    elementIdFieldValues: Map<string, string>
  ) {
    let i = 0;
    let data: (Event | Action)[] = [];

    while (i < rows.length) {
      let { element_ids } = rows[i];
      let currentValue = [];

      for (let elementId of element_ids) {
        let elementIdValue = elementIdFieldValues.get(elementId)!;
        currentValue.push(elementIdValue);
      }

      if (kind === 'event') {
        let event = createEvent(currentValue[0], currentValue.slice(1));
        data.push(event);
      } else {
        let action = createAction(currentValue);
        data.push(action);
      }
      i += element_ids.length;
    }
    return data;
  }

  private getElementIdFieldValues(rows: postgres.RowList<postgres.Row[]>) {
    let elementIdValues: Map<string, string> = new Map();
    for (let i = 0; i < rows.length; i++) {
      let { id, field } = rows[i];
      elementIdValues.set(id, field);
    }
    return elementIdValues;
  }
}
