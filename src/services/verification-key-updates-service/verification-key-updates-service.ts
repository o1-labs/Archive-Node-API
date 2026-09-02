import type postgres from 'postgres';
import { BlockStatusFilter } from '../../blockchain/types.js';
import type { VerificationKeyUpdates } from '../../blockchain/types.js';
import {
  createBlockInfo,
  createTransactionInfo,
} from '../../blockchain/utils.js';
import { throwBlockRangeError } from '../../errors/error.js';
import type { VerificationKeyUpdateFilterInput } from '../../resolvers-types.js';
import { BLOCK_RANGE_SIZE } from '../../server/server.js';
import {
  extractTraceStateFromOptions,
  TracingState,
} from '../../tracing/tracer.js';
import { getVerificationKeyUpdatesQuery } from '../../db/sql/verification-key-updates/queries.js';
import type { IVerificationKeyUpdatesService } from './verification-key-updates-service.interface.js';

export class VerificationKeyUpdatesService
  implements IVerificationKeyUpdatesService
{
  constructor(private readonly client: postgres.Sql) {}

  async getVerificationKeyUpdates(
    input: VerificationKeyUpdateFilterInput,
    options: unknown
  ): Promise<VerificationKeyUpdates> {
    const tracingState = extractTraceStateFromOptions(options);
    return this.getVerificationKeyUpdateData(input, { tracingState });
  }

  async getVerificationKeyUpdateData(
    input: VerificationKeyUpdateFilterInput,
    { tracingState }: { tracingState: TracingState }
  ): Promise<VerificationKeyUpdates> {
    this.validateRange(input.from, input.to);

    const sqlSpan = tracingState.startSpan('verificationKeyUpdates.SQL');
    const rows = await getVerificationKeyUpdatesQuery(
      this.client,
      input.verificationKeyHash,
      input.from,
      input.to,
      input.status ?? BlockStatusFilter.all
    );
    sqlSpan.end();

    const processingSpan = tracingState.startSpan(
      'verificationKeyUpdates.processing'
    );
    const updates = rows.map((row) => ({
      accountUpdateId: row.account_update_id.toString(),
      address: row.address,
      tokenId: row.token_id,
      verificationKeyHash: row.verification_key_hash,
      blockInfo: createBlockInfo(row),
      transactionInfo: createTransactionInfo(row),
    }));
    processingSpan.end();
    return updates;
  }

  private validateRange(from: number, to: number) {
    if (to <= from) {
      throwBlockRangeError('to must be greater than from');
    }
    if (to - from > BLOCK_RANGE_SIZE) {
      throwBlockRangeError(
        `The block range is too large. The maximum range is ${BLOCK_RANGE_SIZE}`
      );
    }
  }
}
