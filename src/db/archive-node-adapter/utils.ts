import postgres from 'postgres';
import {
  Action,
  Event,
  ArchiveNodeDatabaseRow,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  BlockInfo,
} from 'src/models/types';
import {
  createTransactionInfo,
  createEvent,
  createAction,
} from '../../models/utils';
import { filterBestTip, findAllIndexes } from '../../consensus/mina-consensus';

export {
  partitionBlocks,
  getElementIdFieldValues,
  mapActionOrEvent,
  removeRedundantEmittedFields,
  sortAndFilterBlocks,
};

/**
 * Partitions the given rows into a map where the keys are block hashes
 * and the values are maps of transaction hashes to array of rows.
 *
 * For each row, if a block with the same block hash exists in the map,
 * it adds the row to the corresponding transaction in the map.
 * If the block does not exist, it creates a new map entry with the block hash.
 *
 * If the transaction does not exist within a block, it creates a new transaction entry with the transaction hash.
 *
 * @param rows The array of rows to be partitioned.
 * @returns A map where the keys are block hashes and the values are maps of transaction hashes to array of rows.
 */
function partitionBlocks(rows: postgres.RowList<ArchiveNodeDatabaseRow[]>) {
  const blocks: BlocksWithTransactionsMap = new Map();
  if (rows.length === 0) return blocks;

  for (let i = 0; i < rows.length; i++) {
    const { state_hash: blockHash, hash: transactionHash } = rows[i];
    const blockData = blocks.get(blockHash);

    if (blockData === undefined) {
      const firstEntry = new Map();
      firstEntry.set(transactionHash, [rows[i]]);
      blocks.set(blockHash, firstEntry);
    } else {
      const blockDataRows = blockData.get(transactionHash);
      if (blockDataRows) {
        blockDataRows.push(rows[i]);
      } else {
        blockData.set(transactionHash, [rows[i]]);
      }
    }
  }
  return sortParitionedBlocks(blocks);
}

function sortParitionedBlocks(
  blocks: BlocksWithTransactionsMap
): BlocksWithTransactionsMap {
  const sortedBlocks: BlocksWithTransactionsMap = new Map();
  for (const [blockHash, transactions] of blocks) {
    const sortedTransactions = new Map(
      [...transactions.entries()].sort((a, b) => {
        const aHeight = a[1][0].height;
        const bHeight = b[1][0].height;
        return Number(bHeight) - Number(aHeight);
      })
    );
    sortedBlocks.set(blockHash, sortedTransactions);
  }
  return sortedBlocks;
}

/**
 * Extracts 'id' and 'field' properties from each row in the provided array and maps them together.
 *
 * This function iterates over each row in the given array, and for each row, it retrieves
 * the 'id' and 'field' properties. It then stores these values in a Map where the key is
 * the stringified 'id' and the value is the 'field'.
 *
 * @param rows An array of ArchiveNodeDatabaseRow objects to process.
 * @returns A Map where the keys are the stringified 'id' properties from the input rows and
 *          the values are the corresponding 'field' properties.
 */
function getElementIdFieldValues(rows: ArchiveNodeDatabaseRow[]) {
  const elementIdValues: FieldElementIdWithValueMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const { id, field } = rows[i];
    elementIdValues.set(id.toString(), field);
  }
  return elementIdValues;
}

function createUniqueEventId(
  zkapp_account_update_id: number,
  zkapp_event_array_id: number
) {
  return [zkapp_account_update_id, zkapp_event_array_id].join(',');
}

/**
 * Removes redundant fields from an array of rows based on unique event and account update identifiers.
 *
 * @param archiveNodeRow An array of ArchiveNodeDatabaseRow objects to process.
 * @returns A new array of ArchiveNodeDatabaseRow objects where redundant fields have been removed.
 * @throws {Error} If no matching account update is found for a given account update id and event array id.
 */
function removeRedundantEmittedFields(
  archiveNodeRow: ArchiveNodeDatabaseRow[]
) {
  const newRows: ArchiveNodeDatabaseRow[][] = [];
  const seenEventIds = new Set<string>();

  for (let i = 0; i < archiveNodeRow.length; i++) {
    const currentRow = archiveNodeRow[i];

    const {
      zkapp_event_array_id, // Unique event/action identifier
      zkapp_event_element_ids, // List of element ids that map to field values
      zkapp_account_update_id, // Unique account update identifier
      zkapp_account_updates_ids, // List of all account update ids inside the transaction
    } = currentRow;

    const uniqueEventId = createUniqueEventId(
      zkapp_account_update_id,
      zkapp_event_array_id
    );

    if (!seenEventIds.has(uniqueEventId)) {
      // Find the indexes of the specific account update id in the list of account update ids inside a transaction
      const accountUpdateIndexes = findAllIndexes(
        zkapp_account_updates_ids,
        zkapp_account_update_id
      );

      if (accountUpdateIndexes.length === 0) {
        throw new Error(
          `No matching account update found for the given account update ID (${zkapp_account_update_id}) and event array ID (${zkapp_event_array_id}).`
        );
      }

      // AccountUpdate Ids are always unique so we can assume it will return an array with one element
      const accountUpdateIdIndex = accountUpdateIndexes[0];
      // Find the indexes of the specific event array id in the list of event array ids inside a transaction
      const elementIndexes = findAllIndexes(
        zkapp_event_element_ids,
        zkapp_event_array_id
      );

      // For each element index found, we insert the field value into the newRows array at the corresponding account update id index
      elementIndexes.forEach((index) => {
        if (newRows[accountUpdateIdIndex] === undefined) {
          newRows[accountUpdateIdIndex] = [];
        }
        newRows[accountUpdateIdIndex][index] = currentRow;
      });
      seenEventIds.add(uniqueEventId);
    }
  }
  return newRows.flat();
}
/**
 * Maps an array of database rows into an array of Action or Event instances.
 *
 * This function iterates over the given array of rows and for each row, it retrieves the element
 * ids. It then looks up each element id in the provided map of field values and appends the corresponding
 * value to an array, which is used to create a new Action or Event instance, depending on the
 * provided kind.
 *
 * If the kind is 'event', a TransactionInfo object is created from the current row, and this information
 * along with the array of values is used to create a new Event instance. If the kind is 'action',
 * in addition to the TransactionInfo, the account update id from the current row is also used to
 * create a new Action instance. The created instances are appended to the output array.
 *
 * If the element id does not exist in the provided map, the function simply continues with the next id.
 *
 * @param kind The type of instances to create. Can be either 'action' or 'event'.
 * @param rows An array of ArchiveNodeDatabaseRow objects to map into Action or Event instances.
 * @param elementIdFieldValues A map of element ids to their corresponding field values.
 * @returns An array of Action or Event instances.
 */
function mapActionOrEvent(
  kind: 'action' | 'event',
  rows: ArchiveNodeDatabaseRow[],
  elementIdFieldValues: FieldElementIdWithValueMap
) {
  const data: (Event | Action)[] = [];

  for (let i = 0; i < rows.length; i++) {
    const { element_ids } = rows[i];
    const currentValue = [];
    for (const elementId of element_ids) {
      const elementIdValue = elementIdFieldValues.get(elementId.toString());
      if (elementIdValue === undefined) continue;
      currentValue.push(elementIdValue);
    }

    if (kind === 'event') {
      const transactionInfo = createTransactionInfo(rows[i]);
      const event = createEvent(currentValue, transactionInfo);
      data.push(event);
    } else {
      const { zkapp_account_update_id } = rows[i];
      const transactionInfo = createTransactionInfo(rows[i]);
      const action = createAction(
        zkapp_account_update_id.toString(),
        currentValue,
        transactionInfo
      );
      data.push(action);
    }
  }
  return data;
}

function sortAndFilterBlocks<T extends { blockInfo: BlockInfo }>(
  data: T[]
): T[] {
  data.sort((a, b) => b.blockInfo.height - a.blockInfo.height);
  filterBestTip(data);
  return data;
}
