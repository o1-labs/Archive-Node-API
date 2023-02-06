import postgres from 'postgres';

import {
  BlockStatusFilter,
  defaultTokenID,
  Event,
  Events,
} from '../models/types';
import {
  createBlockInfo,
  createTransactionInfo,
  createEvent,
} from '../models/utils';

import type { DatabaseAdapter } from './index';
import type { EventFilterOptionsInput } from '../resolvers-types';

export class ArchiveNodeAdapter implements DatabaseAdapter {
  private client: postgres.Sql;

  constructor(connectionString: string | undefined) {
    if (!connectionString) throw new Error('Missing connection string');
    this.client = postgres(connectionString);
  }

  async getEvents(input: EventFilterOptionsInput): Promise<Events> {
    const start = process.hrtime();
    let rows = await this.buildAndExecuteQuery(input);
    const end = process.hrtime(start);
    console.info('SQL Event Time: %ds %dms', end[0], end[1] / 1000000);

    // Create a map of element_ids to their respective field values
    let elementIdFieldValues = this.getElementIdFieldValues(rows);
    // Create a map of block hashes to their respective blocks returned by the query
    let blocksMap = this.partitionBlocks(rows);

    let eventsData = this.deriveEventsFromBlocks(
      blocksMap,
      elementIdFieldValues
    );
    return eventsData ?? [];
  }

  private async buildAndExecuteQuery(input: EventFilterOptionsInput) {
    let { address, tokenId, status, to, from } = input;
    tokenId ??= defaultTokenID;
    status ??= BlockStatusFilter.all;
    if (to && from && parseInt(to) < parseInt(from)) {
      throw new Error('to must be greater than from');
    }

    console.log(status, status === BlockStatusFilter.all);

    let accountIdentifierCTE = this.client`
        account_identifier AS (
        SELECT id 
        FROM account_identifiers ai
        WHERE ai.public_key_id = (SELECT id FROM public_keys WHERE value = ${address})
        AND ai.token_id = (SELECT id FROM tokens WHERE value = ${tokenId})
    )
    `;
    let blocksAccessedCTE = this.client`
    blocks_accessed AS (
        SELECT *
        FROM account_identifier ai
        INNER JOIN accounts_accessed aa
        ON ai.id = aa.account_identifier_id
        INNER JOIN blocks b
        ON aa.block_id = b.id
        WHERE chain_status <> 'orphaned'
        ${
          status === BlockStatusFilter.all
            ? this.client``
            : this.client`AND chain_status = ${status.toLowerCase()}`
        }
        ${to ? this.client`AND b.height <= ${to}` : this.client``}
        ${from ? this.client`AND b.height >= ${from}` : this.client``}
    )
    `;
    let emittedZkappCommandsCTE = this.client`
    emitted_zkapp_commands AS (
        SELECT *
        FROM blocks_accessed
        INNER JOIN blocks_zkapp_commands bzkc
        ON blocks_accessed.block_id = bzkc.block_id
        INNER JOIN zkapp_commands zkc
        ON bzkc.zkapp_command_id = zkc.id
        INNER JOIN zkapp_account_update zkcu
        ON zkcu.id = ANY(zkc.zkapp_account_updates_ids)
        INNER JOIN zkapp_account_update_body zkcu_body
        ON zkcu_body.id = zkcu.body_id
    )
    `;
    let emittedEventsCTE = this.client`
    emitted_events AS (
        SELECT *
        FROM emitted_zkapp_commands
        INNER JOIN zkapp_events zke
        ON zke.id = events_id
        INNER JOIN zkapp_state_data_array zksda
        ON zksda.id = ANY(zke.element_ids)
        INNER JOIN zkapp_state_data zksd
        ON zksd.id = ANY(zksda.element_ids)
    )
    `;

    return this.client`
    WITH ${accountIdentifierCTE}, ${blocksAccessedCTE}, ${emittedZkappCommandsCTE}, ${emittedEventsCTE}
    SELECT *
    FROM emitted_events
    `;
  }

  private deriveEventsFromBlocks(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    let eventsData: Events = [];
    for (let [_, blocks] of blocksMap) {
      let blockInfo = createBlockInfo(blocks[0]);
      let transactionInfo = createTransactionInfo(blocks[0]);
      let events = this.createEventsFromBlocks(blocks, elementIdFieldValues);

      events.reverse();
      eventsData.push({ blockInfo, transactionInfo, eventData: events });
    }
    return eventsData;
  }

  private partitionBlocks(rows: postgres.RowList<postgres.Row[]>) {
    let blocks: Map<string, postgres.Row[]> = new Map();
    if (rows.length === 0) return blocks;

    for (let i = 0; i < rows.length; i++) {
      let blockHash = rows[i].state_hash;
      let blockData = blocks.get(blockHash);

      if (blockData === undefined) {
        blockData = [];
        blocks.set(blockHash, blockData);
      }
      blockData.push(rows[i]);
    }
    return blocks;
  }

  private createEventsFromBlocks(
    rows: postgres.Row[],
    elementIdFieldValues: Map<string, string>
  ) {
    let i = 0;
    let events: Event[] = [];

    while (i < rows.length) {
      let { element_ids } = rows[i];
      let currentEvent = [];

      for (let elementId of element_ids) {
        let elementIdValue = elementIdFieldValues.get(elementId)!;
        currentEvent.push(elementIdValue);
      }

      let event = createEvent(currentEvent[0], currentEvent.slice(1));
      events.push(event);
      i += element_ids.length;
    }
    return events;
  }

  private getElementIdFieldValues(rows: postgres.RowList<postgres.Row[]>) {
    let elementIdValues: Map<string, string> = new Map();
    for (let i = 0; i < rows.length; i++) {
      let { id, field } = rows[i];
      elementIdValues.set(id, field);
    }
    return elementIdValues;
  }
}
