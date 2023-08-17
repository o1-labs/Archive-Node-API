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

  // The unique identifier that maps events/actions to a specific zkApp.
  zkapp_event_array_id: number;

  // List of `element_ids` that are used to construct the zkApp event.
  zkapp_event_element_ids: number[];

  // `element_ids` represent a list of identifiers that map to specific field values.
  // These are used to identify which field values are used in a zkApp transaction and construct the data returned to the user.
  element_ids: number[];

  // Unique id for a `field` value. Each field value in the Archive Node has it's own unique id.
  id: number;

  // Field value information.
  field: string;

  // Output of the last VRF (Verifiable Random Function).
  last_vrf_output: string;

  // Minimum window density value.
  min_window_density: string;

  // List of densities for each sub-window.
  sub_window_densities: string[];

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
