import type { EventFilterOptionsInput } from '../resolvers-types';
import type { Actions, Events } from '../models/types';
import { ArchiveNodeAdapter } from './archive-node-adapter';

interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
}

export { DatabaseAdapter, ArchiveNodeAdapter };
