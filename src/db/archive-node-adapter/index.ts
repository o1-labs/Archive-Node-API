import postgres from 'postgres';
import { Actions, Events } from 'src/models/types';
import { getTables, USED_TABLES } from './queries';
import type { DatabaseAdapter } from 'src/db/index';
import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
} from 'src/resolvers-types';
import { EventsService } from './events-service';
import { ActionsService } from './actions-service';
import { getTraceInfoFromOptions } from '../../tracing';
import { TracingService } from '../../tracing/tracing';

export class ArchiveNodeAdapter implements DatabaseAdapter {
  /**
   * Connections are created lazily once a query is created.
   * This means that simply doing const sql = postgres(...) won't have any
   * effect other than instantiating a new sql instance. Because of this, sharing the
   * `postgres.Sql` instance across the adapter is safe.
   */
  private client: postgres.Sql;
  private tracingService: TracingService | null;
  private eventsService: EventsService | null;
  private actionsService: ActionsService | null;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString);
    this.tracingService = null;
    this.eventsService = null;
    this.actionsService = null;
  }

  async initializeServices(options: unknown): Promise<void> {
    const traceInfo = getTraceInfoFromOptions(options);
    this.tracingService = new TracingService(traceInfo);
    this.eventsService = new EventsService(this.client, this.tracingService);
    this.actionsService = new ActionsService(this.client, this.tracingService);
  }

  async getEvents(
    input: EventFilterOptionsInput,
    options: unknown
  ): Promise<Events> {
    if (!this.eventsService) {
      await this.initializeServices(options);
    }
    if (!this.eventsService)
      throw new Error(
        'Events service not initialized. Please call initializeServices() before calling getEvents().'
      );
    return this.eventsService.getEvents(input);
  }

  async getActions(
    input: ActionFilterOptionsInput,
    options: unknown
  ): Promise<Actions> {
    if (!this.actionsService) {
      await this.initializeServices(options);
    }
    if (!this.actionsService)
      throw new Error(
        'Actions service not initialized. Please call initializeServices() before calling getActions().'
      );
    return this.actionsService.getActions(input);
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
}
