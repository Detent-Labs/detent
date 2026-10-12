# Design

## Context

See `proposal.md` for the four audit findings. Three facts shape the approach.

**Who resolves a body.** `createDefinitionStore(db).resolveBody(processId, version)` loads a body from `definitions`. For a negative version it loads from `draft_snapshots`. About twenty call sites use it. Two of them check the result against an instance's pin: `resolution.ts` compares `definitionHash(body)` with `inst.definitionHash`, and `rehydrate` in `store.ts` does the same. The timer worker (`timers.ts`), the subprocess handlers (`subprocess.ts`) and the cancel sweep (`transition.ts`) do not.

**Where the audit's B-16 fix goes wrong.** The audit proposes `format('GRANT … TO %I', current_user)` in a `DO` block. Inside `initInstanceAudit` the grants run after `SET LOCAL ROLE detent_audit_owner`. There `current_user` names the owner role. The code captures `engineRole` before that `SET LOCAL ROLE` for this reason. A `DO` block would grant to the owner and leave the engine role with nothing.

**What the B-15 retrofits cover.** `initSchema` holds 23 `ADD COLUMN IF NOT EXISTS` statements and two `UPDATE` statements that fix old rows. It also holds five `DROP INDEX IF EXISTS` lines for index names that no code builds any more. The `CLAUDE.md` stage note says no deployment exists. The owner ruled on 2026-10-12 that all of them go.

## Goals / Non-Goals

**Goals:**
- Every path that resolves a body for an instance refuses a body that differs from the instance's pin.
- `initSchema` states each table once, in its `CREATE TABLE`.
- No identifier reaches `tx.unsafe` unquoted.
- The definition cache holds published bodies only.

**Non-Goals:**
- The `initSchema` start-up lock. It keeps its own entry in `docs/decisions.md`.
- The reporting half of B-15 (history read twice). It belongs to `harden-reporting-export-and-queries`.
- A bound on the published-body cache. Published bodies are few, and each one gets read again.
- A pin check in `outbox.ts`. It resolves by `field_version`, and an outbox row has no hash.

## Decisions

**D1. Verify on load, and verify the pin on every call.** `resolveBody` hashes each parsed body it loads. It compares the result with the row's `definition_hash`. A mismatch throws `DefinitionHashMismatch`. The cache entry keeps the verified hash beside the body. An optional third argument, `pinHash`, gets compared with that stored hash on every call, hit or miss.

The cost is one string comparison per call and one `definitionHash` per cache entry. The `resolveLatest` and `resolveLatestByContract` loaders select `definition_hash` too. They verify only the row they return, so the contract scan keeps its cost. No path then fills the cache with an unchecked body.

- *Alternative: the audit's shape, a row check only.* It catches a body edited under an unchanged hash. It misses a restore that replaces body and hash together. In that case an instance pinned to the old hash must fail. The `pinHash` argument covers it for the price of one parameter.
- *Alternative: every caller calls `definitionHash(body)`.* That repeats the hashing at about seven sites on every call. A new caller can forget it. The store does it once per entry.

`ResolveBody` in `resolution.ts` and `ResolveBodyFn` in `transition.ts` gain `pinHash?: string`. An injected test resolver that ignores the third argument stays valid. The pin sites are the timer worker, the spawn handler (existing child and parent), the return handler (parent and child), the cancel-child handler and `sweepCancelledChildren`. The spawn's lookup of a child by `spec.processId` and `childVersion` passes no pin, because no instance exists yet. A mismatch throws inside the caller's existing error boundary. The timer worker pushes the row out of the scan and logs it. The outbox retries a handler.

**D2. Keep no negative version in the cache (C-12).** The `version < 0` branch returns the parsed body and sets no cache entry. Each read of a test instance's body costs one query by primary key. The D1 check runs on it each time. A Player run reads its body a few times per interaction, so the cost does not show. The alternative, an LRU for negatives, adds a data structure for a path with no measured cost. The pattern cache in `src/runtime/fields.ts` keys a `WeakMap` by body object. A fresh body per read recompiles its regular expressions, and the old entry goes with its body.

*ponytail:* if a Player run ever resolves bodies in a hot loop, bound a negative-only map at that point.

**D3. Move every retrofit into the `CREATE TABLE` (B-15).** Each `ADD COLUMN IF NOT EXISTS` becomes a column line of its table, in the order the `ALTER` ran. Type, default and generation expression stay as they were. The two `UPDATE` statements and the five `DROP INDEX IF EXISTS` lines go, together with the comments that justify only them. A comment that states a reader or a rule that still holds moves with its column. The `auth_users` self-reference `manager_user_id … REFERENCES auth_users(user_id)` is legal inside its own `CREATE TABLE`.

The six generated columns sit in `CREATE TABLE instances`, before the indexes that name them. The comment that explains why the indexes follow the `ADD COLUMN` statements goes, since the columns exist from the first statement.

*Check before recording this design:* run the new `initSchema` against an empty database. Run it against the dev database that the old `initSchema` seeded. The second run must change nothing.

**D4. Quote the role once, where the code captures it (B-16).** `SELECT quote_ident(current_user) AS role` replaces the bare `SELECT current_user` at the top of `initInstanceAudit`. The two `tx.unsafe` strings use `TO ${engineRole}` without surrounding quotes. `quote_ident` doubles an embedded `"` and quotes only when needed. An ordinary role name reads as before. The call stays `tx.unsafe`, because `GRANT` accepts no bind parameter.

- *Alternative: the audit's `format('%I', current_user)` in a `DO` block.* It reads the owner role there, as the Context shows.
- *Alternative: `format('%I', $1)` in a `DO` block.* A `DO` block takes no parameter.

## Risks / Trade-offs

- [An older local `pgdata` lacks a column, and the first query fails with "column does not exist"] → Drop `pgdata` and seed again. The proposal, the persistence delta spec and the report all say so. `CLAUDE.md` states that no deployment exists.
- [A pin check refuses a body] → Only a body that differs from the instance's pin gets refused. `resolution.ts` already refuses it. The instance faults at the existing error boundary.
- [Deleting the retrofits deletes tests] → The tests that build an old-shaped database and assert the repair go with the code. The same commit lowers `scripts/gates/pass-floor.txt` by the number deleted and names the tests.
- [A column order differs between a fresh and an old database] → Nothing selects by position. Every query names its columns.

## Migration Plan

No data migration. A developer with a database from before this change drops it and seeds again. The deploy stack's `reset.sh` does this. For a lane's own project, `docker compose down -v` does it. Rollback is a revert of the commit. A database that this change creates also works with the old `initSchema`, because the old statements are all `IF NOT EXISTS`.

## Open Questions

None.
