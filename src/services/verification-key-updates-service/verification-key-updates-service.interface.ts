import type { VerificationKeyUpdates } from '../../blockchain/types.js';
import type { VerificationKeyUpdateFilterInput } from '../../resolvers-types.js';

export interface IVerificationKeyUpdatesService {
  getVerificationKeyUpdates(
    input: VerificationKeyUpdateFilterInput,
    options: unknown
  ): Promise<VerificationKeyUpdates>;
}
