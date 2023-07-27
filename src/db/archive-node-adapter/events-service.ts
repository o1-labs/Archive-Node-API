import type postgres from 'postgres';
import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  DEFAULT_TOKEN_ID,
  FieldElementIdWithValueMap,
  Events,
  Event,
} from '../../models/types';
import { EventFilterOptionsInput } from 'src/resolvers-types';
import { TracingService } from 'src/tracing/tracing';
import { getEventsQuery } from './queries';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from './utils';
import { createBlockInfo } from '../../models/utils';

import util from 'util';

export { EventsService };

class EventsService {
  constructor(
    private client: postgres.Sql,
    private tracingService: TracingService
  ) {
    this.client = client;
  }

  setTracingService(tracingService: TracingService) {
    this.tracingService = tracingService;
  }

  async getEvents(input: EventFilterOptionsInput): Promise<Events> {
    const eventsData = await this.getEventData(input);
    return eventsData ?? [];
  }

  async getEventData(input: EventFilterOptionsInput): Promise<Events> {
    this.tracingService.startSpan('Events SQL');
    const rows = await this.executeEventsQuery(input);
    console.log(rows);
    this.tracingService.endSpan();

    this.tracingService.startSpan('Events Processing');
    const elementIdFieldValues = getElementIdFieldValues(rows);
    const blocksWithTransactions = partitionBlocks(rows);

    // print out map
    // console.log(util.inspect(blocksWithTransactions, false, null, true));

    const eventsData = this.deriveEventsFromBlocks(
      blocksWithTransactions,
      elementIdFieldValues
    );
    this.tracingService.endSpan();
    const sortedEventsData = sortAndFilterBlocks(eventsData);
    return sortedEventsData;
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

  deriveEventsFromBlocks(
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
