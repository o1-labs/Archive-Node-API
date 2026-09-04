import type postgres from 'postgres';

/**
 * The height of the best chain's tip — the anchor every "walk back from the tip"
 * recursive CTE starts from.
 *
 * This is deliberately NOT `(SELECT MAX(height) FROM blocks)`. The archive keeps every
 * block it ever saw, so after a hard fork the abandoned chain's blocks stay in the table
 * ABOVE the new chain's tip, marked `orphaned`. A global max then lands on a dead block:
 * with the `chain_status = 'pending'` guard the anchor matches nothing and the walk
 * silently degrades to canonical-only rows; without the guard the walk follows the dead
 * chain. Either way the live tip and everything the network produced since the fork is
 * invisible to `inBestChain`, events, actions and action-state resolution.
 *
 * Seen on mainnet at the Mesa upgrade (2026-09-03): the old chain reached height 548187
 * before stopping, the fork block was 548147, and for the whole first hour
 * `blocks(inBestChain: true)` returned nothing above 548147 while `networkState`
 * correctly reported a pending tip of 548164 — the two disagreed because only one of
 * them excluded orphans.
 *
 * Restricting the max to non-orphaned blocks makes the anchor agree with
 * `networkState.pendingMaxBlockHeight` (which is computed per `chain_status`), and it is
 * a no-op in normal operation, where the highest block is always the pending tip.
 */
export const BEST_CHAIN_TIP_HEIGHT_SQL =
  "(SELECT MAX(height) FROM blocks WHERE chain_status <> 'orphaned')";

/**
 * {@link BEST_CHAIN_TIP_HEIGHT_SQL} as a fragment for tagged-template queries. The text is
 * a constant with no user input, which is what makes `unsafe` safe here.
 */
export function bestChainTipHeight(db_client: postgres.Sql) {
  return db_client.unsafe(BEST_CHAIN_TIP_HEIGHT_SQL);
}
