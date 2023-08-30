import type postgres from 'postgres';
import {
  BlockStatusFilter,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  Events,
  Event,
} from '../../blockchain/types';
import type { ITracingService } from '../tracing-service/tracing-service.interface';
import type { EventFilterOptionsInput } from '../../resolvers-types';
import { createBlockInfo } from '../../blockchain/utils';
import { DEFAULT_TOKEN_ID } from '../../blockchain/constants';
import { getEventsQuery } from '../../db/sql/events-actions/queries';
import {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
} from '../data-adapters/database-row-adapters';
import { IEventsService } from './events-service.interface';

export { EventsService };

class EventsService implements IEventsService {
  constructor(
    private client: postgres.Sql,
    private tracingService: ITracingService
  ) {
    this.client = client;
  }

  setTracingService(tracingService: ITracingService) {
    this.tracingService = tracingService;
  }

  async getEvents(input: EventFilterOptionsInput): Promise<Events> {
    return (await this.getEventData(input)) ?? [];
  }

  async getEventData(input: EventFilterOptionsInput): Promise<Events> {
    this.tracingService.startSpan('events.SQL');
    const rows = await this.executeEventsQuery(input);
    this.tracingService.endSpan();

    this.tracingService.startSpan('events.processing');
    const elementIdFieldValues = getElementIdFieldValues(rows);
    const blocksWithTransactions = partitionBlocks(rows);
    const eventsData = this.blocksToEvents(
      blocksWithTransactions,
      elementIdFieldValues
    );
    this.tracingService.endSpan();
    return sortAndFilterBlocks(eventsData);
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

  blocksToEvents(
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
