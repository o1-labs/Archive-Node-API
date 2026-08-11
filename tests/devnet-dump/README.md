# Devnet dump tests

Tests that run against a real archive dump, downloaded from the public
`mina-archive-dumps` GCS bucket. They are not part of the pull-request gate:
the download and load take minutes, and the data changes every hour.

```bash
npm run test:devnet-dump
```

Scheduled nightly by `.github/workflows/nightly-devnet-dump.yaml`, which can
also be started by hand from the Actions tab.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DEVNET_DUMP_PATH` | `./data/devnet-archive.sql` | Use a dump you already have instead of downloading one |
| `PG_TEST_HOST` / `PG_TEST_PORT` / `PG_TEST_USER` / `PG_TEST_PASSWORD` | `localhost` / `5432` / `postgres` / `postgres` | PostgreSQL connection |
| `ACTION_STATE_SAMPLE_ACCOUNTS` | `25` | Accounts checked by the action-state invariant suite |
| `ACTION_STATE_MAX_CHECKPOINTS_PER_ACCOUNT` | `12` | Checkpoints checked per account |

A dump loaded at `DEVNET_DUMP_PATH` does not have to be devnet. Point it at a
mesa or mainnet dump and the same invariants apply.

## The action-state invariant suite

`action-state-invariants.ts` checks that `fromActionState` and `endActionState`
return the right actions on real data. It is registered from
`devnet-dump.test.ts` rather than living in a test file of its own, because
node:test gives each file its own process, and therefore its own multi-minute
dump load.

Its per-pull-request counterpart is
`tests/integration/action-state-ordering.test.ts`. The two do different jobs:

| | Fixture suite (per PR) | This suite (nightly) |
|---|---|---|
| Data | generated, deterministic | a real dump, different every run |
| Question | does the known defect stay fixed? | do the rules hold on real data shapes? |
| Builds its own adversarial case | yes — inverts the interning order on purpose | no — it takes the data as it comes |

### Why it needs no maintenance

The dump rotates hourly, so anything pinned to its contents would rot within a
day. Four rules keep this suite from needing upkeep. Keep them if you extend it.

1. **No expected values.** Every assertion is an invariant the data implies
   about itself. The unfiltered action list is the reference, and the filtered
   queries are compared against it:
   - `fromActionState: X` must return exactly the suffix of the unfiltered list
     that starts at X;
   - `endActionState: Y` must return exactly the prefix through Y;
   - in any returned list, `actionStateOne[i]` must equal `actionStateTwo[i+1]`;
   - an action state of another account must be rejected.

   There is no block height, address or count to update when the data changes.

2. **Subjects are discovered, never named.** The suite asks the database which
   accounts have at least two action states, and checks the most active ones
   first. Accounts whose action states carry an interning-order inversion come
   first, because those are the ones the old code answered incorrectly.

   Discovery is ordered deterministically. Do not use `ORDER BY random()` — a
   nightly failure that cannot be reproduced on the same dump is a failure
   nobody can act on.

3. **Finding nothing to test is a failure.** The last test asserts that the run
   actually covered some accounts and checkpoints. A suite that silently tests
   nothing is worse than no suite, because it reports success. If it fires,
   either the dump holds no zkApp action history or the discovery query no
   longer matches the archive schema; both need a person.

4. **A failure must be reproducible without the dump.** Messages carry the
   account, a compact difference, and a GraphQL query to paste into any
   endpoint:

   ```
   fromActionState returned the wrong set of blocks.
     account    : B62qmMvzQNSCnZ4qH1N9uJByov9EyGushzv1jV7Cqg8UwS6BrRgHGzk
     checkpoint : 27078409473756655551477733610137394255970846757871033008217988809531431111245 (block 303199)
     entries    : expected 133, got 132
     diverges at: index 1 (expected block 303203, got 303207)
     missing    : [303203]
     unexpected : none
     reproduce  : { actions(input: { address: "B62q…", fromActionState: "27078…" }) { … } }
   ```

   Accounts on a real chain can have hundreds of action states, so the message
   reports the first divergence and the missing or unexpected blocks rather than
   printing both lists in full.

### If it fails

Run the printed `reproduce` query against the endpoint under test. The suite
finds the fault; it does not need the dump to explain it.

The suite is also self-checking: run it with an old build of `ActionsService`
against a dump that contains an interning-order inversion, and it must fail. A
suite that cannot fail is proving nothing.
