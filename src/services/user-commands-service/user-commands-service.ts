import type postgres from 'postgres';
import { BlockStatusFilter } from '../../blockchain/types.js';
import type { AccountUserCommands } from '../../blockchain/types.js';
import { createBlockInfo } from '../../blockchain/utils.js';
import { throwBlockRangeError } from '../../errors/error.js';
import type { UserCommandFilterInput } from '../../resolvers-types.js';
import { BLOCK_RANGE_SIZE, USER_COMMAND_LIMIT } from '../../server/server.js';
import {
  extractTraceStateFromOptions,
  TracingState,
} from '../../tracing/tracer.js';
import {
  getPublicKeyIdQuery,
  getUserCommandsQuery,
} from '../../db/sql/user-commands/queries.js';
import type { IUserCommandsService } from './user-commands-service.interface.js';

export { UserCommandsService, validateUserCommandRange };

function validateUserCommandRange(from: number, to: number) {
  if (to <= from) {
    throwBlockRangeError('to must be greater than from');
  }
  if (to - from > BLOCK_RANGE_SIZE) {
    throwBlockRangeError(
      `The block range is too large. The maximum range is ${BLOCK_RANGE_SIZE}`
    );
  }
}

class UserCommandsService implements IUserCommandsService {
  constructor(private readonly client: postgres.Sql) {}

  async getUserCommands(
    input: UserCommandFilterInput,
    options: unknown
  ): Promise<AccountUserCommands> {
    const tracingState = extractTraceStateFromOptions(options);
    return this.getUserCommandData(input, { tracingState });
  }

  async getUserCommandData(
    input: UserCommandFilterInput,
    { tracingState }: { tracingState: TracingState }
  ): Promise<AccountUserCommands> {
    validateUserCommandRange(input.from, input.to);

    const sqlSpan = tracingState.startSpan('userCommands.SQL');
    // Resolve the key first: the main query needs the id as a plain value to
    // plan with that account's statistics (see getUserCommandsQuery).
    const [account] = await getPublicKeyIdQuery(this.client, input.address);
    if (account === undefined) {
      sqlSpan.end();
      return [];
    }
    // One row more than the limit tells "exactly at the limit" from "over it".
    const rows = await getUserCommandsQuery(
      this.client,
      account.id,
      input.from,
      input.to,
      input.status ?? BlockStatusFilter.all,
      USER_COMMAND_LIMIT + 1
    );
    sqlSpan.end();

    if (rows.length > USER_COMMAND_LIMIT) {
      throwBlockRangeError(
        `The block range holds more than ${USER_COMMAND_LIMIT} user commands for this account; use a smaller block range.`
      );
    }

    const processingSpan = tracingState.startSpan('userCommands.processing');
    const commands = rows.map((row) => ({
      blockInfo: createBlockInfo(row),
      sequenceNumber: row.sequence_no,
      hash: row.hash,
      kind: row.command_type,
      feePayer: row.fee_payer,
      from: row.source,
      to: row.receiver,
      amount: row.amount,
      fee: row.fee,
      memo: row.memo,
      nonce: Number(row.nonce),
      status: row.status,
      failureReason: row.failure_reason,
    }));
    processingSpan.end();
    return commands;
  }
}
