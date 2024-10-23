import type {
  Action,
  Event,
  BlocksWithTransactionsMap,
  FieldElementIdWithValueMap,
  BlockInfo,
} from '../../blockchain/types.js';
import type { ArchiveNodeDatabaseRow } from '../../db/sql/events-actions/types.js';
import {
  createTransactionInfo,
  createEvent,
  createAction,
} from '../../blockchain/utils.js';
import { filterBestTip } from '../../consensus/mina-consensus.js';

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
function partitionBlocks(rows: ArchiveNodeDatabaseRow[]) {
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
  return blocks;
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
 * There are redundant fields in the database output because a single action/event can be made up of multiple fields, which means
 * we get rows with the same account update id and event array id but different field values.
 *
 * We remove rows that refer to the same event/action that is emitted, but just keep one row since
 * one row can be used to derive all event/action field values (by it's element_ids).
 *
 * @example
 * The following rows are returned from the database, which represents one event/action:
 * [
 *    { id: 1, field: "1", element_ids: [3, 2, 1], zkapp_event_array_id: 1, zkapp_account_update_id: 1, zkapp_account_updates_ids: [1, 2, 3] },
 *    { id: 2, field: "2", element_ids: [3, 2, 1], zkapp_event_array_id: 1, zkapp_account_update_id: 1, zkapp_account_updates_ids: [1, 2, 3] },
 *    { id: 3, field: "3", element_ids: [3, 2, 1], zkapp_event_array_id: 1, zkapp_account_update_id: 1, zkapp_account_updates_ids: [1, 2, 3] },
 * ]
 *
 * `id` corresponds to the field id, the `field` corresponds to the field value, and the `element_ids` correspond to the field ids. Since these rows
 * represent a single event/action, they are all redundant because they have the same event array id and account update id.
 *
 * The output of this function will be:
 * [
 *   { id: 1, field: "1", element_ids: [3, 2, 1], zkapp_event_array_id: 1, zkapp_account_update_id: 1, zkapp_account_updates_ids: [1, 2, 3] },
 * ]
 *
 *
 * @param archiveNodeRow An array of ArchiveNodeDatabaseRow objects to process.
 * @returns A new array of ArchiveNodeDatabaseRow objects where redundant fields have been removed.
 * @throws {Error} If no matching account update is found for a given account update id and event array id.
 */
function removeRedundantEmittedFields(
  archiveNodeRow: ArchiveNodeDatabaseRow[]
) {
  const inOrderTransactionRows: ArchiveNodeDatabaseRow[][] = [];
  const seenEventOrActionIds = new Set<string>();
  for (let i = 0; i < archiveNodeRow.length; i++) {
    const currentRow = archiveNodeRow[i];
    const {
      zkapp_event_array_id, // The unique id for the event/action emitted
      zkapp_event_element_ids, // The list of field ids that make up the event/action
      zkapp_account_update_id, // The unique id for the account update that emitted the event/action
      zkapp_account_updates_ids, // List of all account update ids inside the transaction
    } = currentRow;

    // Create a unique Id consisting of the account update id and event/action id emitted
    // This is used to check if we have already seen this event/action before.
    const uniqueEventId = createUniqueEventId(
      zkapp_account_update_id,
      zkapp_event_array_id
    );

    if (!seenEventOrActionIds.has(uniqueEventId)) {
      // Since multiple events/actions can be emitted in a single account update, we want to put back the event/action
      // in the correct place. To do this, we need to know the index of the event array id in the list of event array ids (these stored in order by the Archive Node)
      const emittedEventOrActionIndexes = findAllIndexes(
        zkapp_event_element_ids,
        zkapp_event_array_id
      );

      // Since multiple account updates can be emitted in a single transaction, we need to know the index of the account update id in the list of account update ids
      const accountUpdateIndexes = findAllIndexes(
        zkapp_account_updates_ids,
        zkapp_account_update_id
      );

      if (accountUpdateIndexes.length === 0) {
        throw new Error(
          `No matching account update found for the given account update ID (${zkapp_account_update_id}) and event array ID (${zkapp_event_array_id}).`
        );
      }

      const accountUpdateIdIndex = accountUpdateIndexes[0];

      // Put the event/action back in the correct place. The specific event/action should go into the index of the account update that emitted it.
      // When we put this all together, the transaction will be in the correct order.
      emittedEventOrActionIndexes.forEach((eventOrActionIndex) => {
        if (inOrderTransactionRows[accountUpdateIdIndex] === undefined) {
          inOrderTransactionRows[accountUpdateIdIndex] = [];
        }
        inOrderTransactionRows[accountUpdateIdIndex][eventOrActionIndex] =
          currentRow;
      });
      seenEventOrActionIds.add(uniqueEventId);
    }
  }
  return inOrderTransactionRows.flat();
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
    const transactionInfo = createTransactionInfo(rows[i]);
    const elementIdToFieldValues = getFieldValuesFromElementIds(
      element_ids,
      elementIdFieldValues
    );

    if (kind === 'event') {
      const event = createEvent(elementIdToFieldValues, transactionInfo);
      data.push(event);
    } else {
      const { zkapp_account_update_id } = rows[i];
      const action = createAction(
        zkapp_account_update_id.toString(),
        elementIdToFieldValues,
        transactionInfo
      );
      data.push(action);
    }
  }
  return data;
}

function getFieldValuesFromElementIds(
  element_ids: number[],
  elementIdFieldValues: FieldElementIdWithValueMap
) {
  const elementIdToFieldValues = [];
  for (const elementId of element_ids) {
    const elementIdFieldValue = elementIdFieldValues.get(elementId.toString());
    if (elementIdFieldValue === undefined) continue;
    elementIdToFieldValues.push(elementIdFieldValue);
  }
  return elementIdToFieldValues;
}

function sortAndFilterBlocks<T extends { blockInfo: BlockInfo }>(data: T[]) {
  data.sort((a, b) => {
    if (a.blockInfo.height < b.blockInfo.height) return -1;
    if (a.blockInfo.height > b.blockInfo.height) return 1;
    if (a.blockInfo.timestamp < b.blockInfo.timestamp) return -1;
    if (a.blockInfo.timestamp > b.blockInfo.timestamp) return 1;
    return 0;
  });
  filterBestTip(data);
}

function findAllIndexes<T>(arr: T[], target: T): number[] {
  const indexes: number[] = [];
  arr.forEach((element, index) => {
    if (element === target) {
      indexes.push(index);
    }
  });
  return indexes;
}
