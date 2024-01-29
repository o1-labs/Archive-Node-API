import postgres from 'postgres';
import type { Actions, Events } from '../../blockchain/types.js';
import type { DatabaseAdapter } from './archive-node-adapter.interface.js';
import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
} from '../../resolvers-types.js';
import { getTables, USED_TABLES } from '../../db/sql/events-actions/queries.js';
import { EventsService } from '../../services/events-service/events-service.js';
import { IEventsService } from '../../services/events-service/events-service.interface.js';
import { ActionsService } from '../../services/actions-service/actions-service.js';
import { IActionsService } from '../../services/actions-service/actions-service.interface.js';

export class ArchiveNodeAdapter implements DatabaseAdapter {
  /**
   * Connections are created lazily once a query is created.
   * This means that simply doing const sql = postgres(...) won't have any
   * effect other than instantiating a new sql instance. Because of this, sharing the
   * `postgres.Sql` instance across the adapter is safe.
   */
  private client: postgres.Sql;
  private eventsService: IEventsService;
  private actionsService: IActionsService;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString);
    this.eventsService = new EventsService(this.client);
    this.actionsService = new ActionsService(this.client);
  }

  async getEvents(
    input: EventFilterOptionsInput,
    options: unknown
  ): Promise<Events> {
    return this.eventsService.getEvents(input, options);
  }

  async getActions(
    input: ActionFilterOptionsInput,
    options: unknown
  ): Promise<Actions> {
    return this.actionsService.getActions(input, options);
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
