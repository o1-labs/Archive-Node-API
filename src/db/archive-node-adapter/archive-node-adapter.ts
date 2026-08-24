import postgres from 'postgres';
import type {
  Actions,
  Events,
  NetworkState,
  Blocks,
} from '../../blockchain/types.js';
import type { DatabaseAdapter } from './archive-node-adapter.interface.js';
import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
  BlockQueryInput,
  BlockSortByInput,
} from '../../resolvers-types.js';
import { getTables, USED_TABLES } from '../../db/sql/events-actions/queries.js';
import { EventsService } from '../../services/events-service/events-service.js';
import { IEventsService } from '../../services/events-service/events-service.interface.js';
import { ActionsService } from '../../services/actions-service/actions-service.js';
import { IActionsService } from '../../services/actions-service/actions-service.interface.js';
import { NetworkService } from '../../services/network-service/network-service.js';
import { INetworkService } from '../../services/network-service/network-service.interface.js';
import { BlocksService } from '../../services/blocks-service/blocks-service.js';
import { IBlocksService } from '../../services/blocks-service/blocks-service.interface.js';

/**
 * Connect deadline for the readiness pinger, in seconds. Kept short so a probe
 * fails fast rather than hanging for the driver's 30s default.
 */
const PING_CONNECT_TIMEOUT_S = 2;

export class ArchiveNodeAdapter implements DatabaseAdapter {
  /**
   * Connections are created lazily once a query is created.
   * This means that simply doing const sql = postgres(...) won't have any
   * effect other than instantiating a new sql instance. Because of this, sharing the
   * `postgres.Sql` instance across the adapter is safe.
   */
  private client: postgres.Sql;
  /**
   * Dedicated single-connection client for readiness pings. postgres.js queues
   * onto busy connections, so using the main pool can make a merely-busy DB look
   * unreachable while long GraphQL queries are running.
   */
  private pingClient: postgres.Sql;
  private eventsService: IEventsService;
  private actionsService: IActionsService;
  private networkService: INetworkService;
  private blocksService: IBlocksService;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString);
    this.pingClient = postgres(connectionString, {
      max: 1,
      idle_timeout: 60,
      connect_timeout: PING_CONNECT_TIMEOUT_S,
    });
    this.eventsService = new EventsService(this.client);
    this.actionsService = new ActionsService(this.client);
    this.networkService = new NetworkService(this.client);
    this.blocksService = new BlocksService(this.client);
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

  async getNetworkState(options: unknown): Promise<NetworkState> {
    return this.networkService.getNetworkState(options);
  }

  async getBlocks(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    options: unknown
  ): Promise<Blocks> {
    return this.blocksService.getBlocks(query, limit, sortBy, options);
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

  async ping(): Promise<boolean> {
    try {
      await this.pingClient`SELECT 1`;
      return true;
    } catch (error) {
      console.warn(
        `[readiness] database ping failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  async close() {
    await Promise.all([this.client.end(), this.pingClient.end()]);
  }
}
