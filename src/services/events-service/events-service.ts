import type postgres from 'postgres';
import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  Events,
  Event,
} from '../../blockchain/types.js';
import type { EventFilterOptionsInput } from '../../resolvers-types.js';
import { createBlockInfo } from '../../blockchain/utils.js';
import { DEFAULT_TOKEN_ID } from '../../blockchain/constants.js';
import { getEventsQuery } from '../../db/sql/events-actions/queries.js';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from '../data-adapters/database-row-adapters.js';
import { IEventsService } from './events-service.interface.js';
import {
  TracingState,
  extractTraceStateFromOptions,
} from '../../tracing/tracer.js';
import { BLOCK_RANGE_SIZE } from '../../server/server.js';
import { throwBlockRangeError } from '../../errors/error.js';

export { EventsService };

class EventsService implements IEventsService {
  private readonly client: postgres.Sql;

  constructor(client: postgres.Sql) {
    this.client = client;
  }

  async getEvents(
    input: EventFilterOptionsInput,
    options: unknown
  ): Promise<Events> {
    const tracingState = extractTraceStateFromOptions(options);
    return (await this.getEventData(input, { tracingState })) ?? [];
  }

  async getEventData(
    input: EventFilterOptionsInput,
    { tracingState }: { tracingState: TracingState }
  ): Promise<Events> {
    const sqlSpan = tracingState.startSpan('events.SQL');
    const rows = await this.executeEventsQuery(input);
    sqlSpan.end();

    const processingSpan = tracingState.startSpan('events.processing');
    const elementIdFieldValues = getElementIdFieldValues(rows);
    const blocksWithTransactions = partitionBlocks(rows);
    const eventsData = this.blocksToEvents(
      blocksWithTransactions,
      elementIdFieldValues
    );
    sortAndFilterBlocks(eventsData);
    processingSpan.end();
    return eventsData;
  }

  private async executeEventsQuery(input: EventFilterOptionsInput) {
    const { address, to, from } = input;
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

    return getEventsQuery(
      this.client,
      address,
      tokenId,
      status,
      to?.toString(),
      from?.toString()
    );
  }

  blocksToEvents(
    blocksWithTransactions: BlocksWithTransactionsMap,
    elementIdFieldValues: FieldElementIdWithValueMap
  ) {
    const events: Events = [];
    const blockMapEntries = Array.from(blocksWithTransactions.entries());
    for (let i = 0; i < blockMapEntries.length; i++) {
      const transactions = blockMapEntries[i][1];
      const transaction = transactions.values().next().value![0];
      const blockInfo = createBlockInfo(transaction);

      const eventsData: Event[][] = [];
      for (const [, transaction] of transactions) {
        const filteredBlocks = removeRedundantEmittedFields(transaction);
        const eventData = mapActionOrEvent(
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
}
