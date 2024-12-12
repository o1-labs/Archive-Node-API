// Namespaces are used here as an alias to the simple number and number[] types in order to model
// the relationships between the different types of data in the system.

/**
 * A Field is the smallest unit of raw data in an Event
 */
namespace Field {
  /**
   * The id of the Field in the archive node postres DB
   */
  export type Id = number;

  /**
   * The raw value of the Field
   */
  export type Value = string;
}

/**
 * An EventFieldArray is an Array of {@link Field.Id} which represents a multi-Field datum within an event
 * For instance, a public key is 2 fields, so it will generate an EventFieldArray with 2 Field.Ids
 */
namespace EventFieldArray {
  /**
   * The id of the EventFieldArray in the archive node postres DB
   */
  export type Id = number;

  /**
   * An array of {@link Field.Id}
   */
  export type FieldIds = Field.Id[];
}

/**
 * An Event is a collection of {@link EventFieldArray.Id} which represents a single event in the system
 * Because an event may contain multiple data, it is represented as an array of arrays
 */
namespace Event {
  /**
   * The id of the Event in the archive node postres DB
   */
  export type Id = number;

  /**
   * An array of {@link EventFieldArray.Id}
   */
  export type EventFieldArrayIds = EventFieldArray.Id[];
}

/**
 * Represents a complete row from the Archive Node database.
 * This structure gathers information related to blocks, transactions, events, and associated zkApp updates.
 */
export type ArchiveNodeDatabaseRow = {
  /**
   * Unique block identifier.
   */
  block_id: number;

  /**
   * zkApp identifier.
   */
  zkapp_id: number;

  /**
   * Hash representing the state of the block.
   */
  state_hash: string;

  /**
   * Hash representing the parent of the block.
   */
  parent_hash: string;

  /**
   * Numeric representation of block's height in the chain.
   */
  height: string;

  /**
   * Slot count since genesis.
   */
  global_slot_since_genesis: string;

  /**
   * Slot count since the last hard fork.
   * @type {string}
   */
  global_slot_since_hard_fork: string;

  /**
   * Type of authorization used for the block.
   */
  authorization_kind: string;

  /**
   * Timestamp when the block was created.
   */
  timestamp: string;

  /**
   * Current status of the block within the chain (e.g., canonical, orphaned).
   */
  chain_status: string;

  /**
   * Sequence number of the transaction within a block.
   */
  sequence_number: number;

  /**
   * Hash representing the ledger state.
   */
  ledger_hash: string;

  /**
   * Distance from the block with the maximum height.
   */
  distance_from_max_block_height: string;

  /**
   * Unique identifier for the zkApp account update.
   */
  zkapp_account_update_id: number;

  /**
   * List of Account Update IDs associated with the transaction
   */
  zkapp_account_updates_ids: number[];

  /**
   * Status of the transaction.
   */
  status: string;

  /**
   * Optional memo field for additional details.
   */
  memo: string;

  /**
   * Unique hash identifier for this row's data.
   */
  hash: string;

  /**
   * ID of a single event in an account update.
   */
  account_update_event_id: Event.Id;

  /**
   * List of IDs of the field arrays used to construct the event array.
   */
  event_element_ids: Event.EventFieldArrayIds;

  /**
   * ID referencing an array of field elements associated with an event.
   */
  event_field_elements_id: EventFieldArray.Id;

  /**
   * List of `element_ids` that are used to construct the field array.
   * Each entry corresponds to a `Field.Id`, linking to a `Field`.
   */
  event_field_element_ids: EventFieldArray.FieldIds;

  /**
   * Unique ID for a `field`.
   * Each `field_id` corresponds to one `Field`.
   */
  field_id: Field.Id;

  /**
   * Value of the field corresponding to `field_id`.
   */
  field_value: Field.Value;

  /**
   * Output of the last VRF (Verifiable Random Function).
   */
  last_vrf_output: string;

  /**
   * (Optional) Action state value 1.
   */
  action_state_value1?: string;

  /**
   * (Optional) Action state value 2.
   */
  action_state_value2?: string;

  /**
   * (Optional) Action state value 3.
   */
  action_state_value3?: string;

  /**
   * (Optional) Action state value 4.
   */
  action_state_value4?: string;

  /**
   * (Optional) Action state value 5.
   */
  action_state_value5?: string;
};
