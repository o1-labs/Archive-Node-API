/**
 * Type representing a database row with detailed information related to the archive node.
 * This includes fields such as block-related hashes, account information, action states, and more.
 */
export type ArchiveNodeDatabaseRow = {
  // Unique block identifier.
  block_id: number;

  // zkapp identifier.
  zkapp_id: number;

  // Hash representing the state of the block.
  state_hash: string;

  // Hash representing the parent of the block.
  parent_hash: string;

  // Numeric representation of block's height in the chain.
  height: string;

  // Slot count since genesis.
  global_slot_since_genesis: string;

  // Slot count since the last hard fork.
  global_slot_since_hard_fork: string;

  // Type of authorization used for the block.
  authorization_kind: string;

  // Timestamp when the block was created.
  timestamp: string;

  // Current status of the block within the chain.
  chain_status: string;

  // Sequence number of the transaction within a block
  sequence_number: number;

  // Hash representing the ledger state.
  ledger_hash: string;

  // Distance from the block with the maximum height.
  distance_from_max_block_height: string;

  // Unique identifier for the zkapp account update.
  zkapp_account_update_id: number;

  // List of identifiers inside a zkapp account update.
  zkapp_account_updates_ids: number[];

  // Status of the transaction.
  status: string;

  // Optional memo field for additional details.
  memo: string;

  // Unique hash identifier.
  hash: string;

  // id of a single event in an account update
  account_update_event_id: number;

  // List of ids of the field arrays used to construct the event array
  // each account_update_event may have many event elements
  event_element_ids: number[];

  // id of an array of field elements
  // each event_element_id in event_element_ids is an event_field_elements_id
  event_field_elements_id: number;

  // List of `element_ids` that are used to construct the field array.
  // Each event_field_elements_id points to an array of event_field_element_ids
  event_field_element_ids: number[];

  // Unique id for a `field` value. Each field value in the Archive Node has it's own unique id.
  // Each element_id in event_field_element_ids is a field_id
  field_id: number;

  // Field value information.
  // Each field_id points to a single field_value
  field_value: string;

  // Output of the last VRF (Verifiable Random Function).
  last_vrf_output: string;

  // (Optional) Action state value 1.
  action_state_value1?: string;

  // (Optional) Action state value 2.
  action_state_value2?: string;

  // (Optional) Action state value 3.
  action_state_value3?: string;

  // (Optional) Action state value 4.
  action_state_value4?: string;

  // (Optional) Action state value 5.
  action_state_value5?: string;
};
