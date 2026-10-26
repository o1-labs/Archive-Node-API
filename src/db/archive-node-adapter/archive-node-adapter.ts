import postgres from 'postgres';
import type {
  Actions,
  Events,
  NetworkState,
  Blocks,
  VerificationKeyUpdates,
  ZkappCommands,
  AccountUserCommands,
} from '../../blockchain/types.js';
import type { DatabaseAdapter } from './archive-node-adapter.interface.js';
import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
  BlockQueryInput,
  BlockSortByInput,
  VerificationKeyUpdateFilterInput,
  ZkappCommandFilterOptionsInput,
  UserCommandFilterInput,
} from '../../resolvers-types.js';
import { getTables, USED_TABLES } from '../../db/sql/events-actions/queries.js';
import { buildPostgresOptions } from './postgres-options.js';
import { EventsService } from '../../services/events-service/events-service.js';
import { IEventsService } from '../../services/events-service/events-service.interface.js';
import { ActionsService } from '../../services/actions-service/actions-service.js';
import { IActionsService } from '../../services/actions-service/actions-service.interface.js';
import { ZkappCommandsService } from '../../services/zkapp-commands-service/zkapp-commands-service.js';
import { IZkappCommandsService } from '../../services/zkapp-commands-service/zkapp-commands-service.interface.js';
import { UserCommandsService } from '../../services/user-commands-service/user-commands-service.js';
import { IUserCommandsService } from '../../services/user-commands-service/user-commands-service.interface.js';
import { getMissingUserCommandIndexesQuery } from '../../db/sql/user-commands/queries.js';
import { ENABLE_USER_COMMANDS_QUERY } from '../../server/server.js';
import { NetworkService } from '../../services/network-service/network-service.js';
import { INetworkService } from '../../services/network-service/network-service.interface.js';
import { BlocksService } from '../../services/blocks-service/blocks-service.js';
import { IBlocksService } from '../../services/blocks-service/blocks-service.interface.js';
import { VerificationKeyUpdatesService } from '../../services/verification-key-updates-service/verification-key-updates-service.js';
import { IVerificationKeyUpdatesService } from '../../services/verification-key-updates-service/verification-key-updates-service.interface.js';

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
  private zkappCommandsService: IZkappCommandsService;
  private userCommandsService: IUserCommandsService;
  private networkService: INetworkService;
  private blocksService: IBlocksService;
  private verificationKeyUpdatesService: IVerificationKeyUpdatesService;

  constructor(connectionString: string | undefined) {
    if (!connectionString)
      throw new Error(
        'Missing Postgres Connection String. Please provide a valid connection string in the environment variables or in your configuration file to connect to the Postgres database.'
      );
    this.client = postgres(connectionString, buildPostgresOptions());
    this.pingClient = postgres(connectionString, {
      max: 1,
      idle_timeout: 60,
      connect_timeout: PING_CONNECT_TIMEOUT_S,
    });
    this.eventsService = new EventsService(this.client);
    this.actionsService = new ActionsService(this.client);
    this.zkappCommandsService = new ZkappCommandsService(this.client);
    this.userCommandsService = new UserCommandsService(this.client);
    this.networkService = new NetworkService(this.client);
    this.blocksService = new BlocksService(this.client);
    this.verificationKeyUpdatesService = new VerificationKeyUpdatesService(
      this.client
    );
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

  async getZkappCommands(
    input: ZkappCommandFilterOptionsInput,
    options: unknown
  ): Promise<ZkappCommands> {
    return this.zkappCommandsService.getZkappCommands(input, options);
  }

  async getUserCommands(
    input: UserCommandFilterInput,
    options: unknown
  ): Promise<AccountUserCommands> {
    return this.userCommandsService.getUserCommands(input, options);
  }

  async getNetworkState(options: unknown): Promise<NetworkState> {
    return this.networkService.getNetworkState(options);
  }

  async getVerificationKeyUpdates(
    input: VerificationKeyUpdateFilterInput,
    options: unknown
  ): Promise<VerificationKeyUpdates> {
    return this.verificationKeyUpdatesService.getVerificationKeyUpdates(
      input,
      options
    );
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
    if (ENABLE_USER_COMMANDS_QUERY) {
      await this.warnIfUserCommandIndexesMissing();
    }
  }

  // userCommands still answers correctly without these indexes, but each
  // request then reads all of user_commands. Say so at startup instead of
  // letting it surface as timeouts.
  private async warnIfUserCommandIndexesMissing() {
    const missing = (await getMissingUserCommandIndexesQuery(this.client)).map(
      (row) => row.name
    );
    if (missing.length > 0) {
      console.warn(
        `[userCommands] missing indexes on user_commands: ${missing.join(
          ', '
        )}. ` +
          'Every userCommands request will scan the whole table. Apply the ' +
          "archive's 5.0.0 upgrade.sql, or create them with CREATE INDEX CONCURRENTLY."
      );
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
