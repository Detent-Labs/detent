<!-- antislop: allow-file passive-voice -->
<!-- Task lines name the assertion a test makes ("no external sort is used"),
     which reads passive by convention. -->

## 1. Schema

- [x] 1.1 Add the `instance_principals` relation to `initSchema`
      (`src/engine/store.ts`): `instance_id text` referencing `instances` with
      `ON DELETE CASCADE`, `principal text`, `created_at timestamptz NOT NULL`,
      primary key `(instance_id, principal)`. Verify a fresh `initSchema` run
      creates it and a second run is a no-op.
- [x] 1.2 Add the index `(principal, created_at DESC, instance_id DESC)` in the
      same idempotent style. Verify it exists after `initSchema` and that its
      column order matches design.md's "created_at is denormalized" decision.
- [x] 1.3 Add the denial relation `instance_principals_denied`: `instance_id`
      referencing `instances` with `ON DELETE CASCADE`, `actor_id text`,
      primary key `(actor_id, instance_id)`. Verify `initSchema` creates it and
      that a second run is a no-op.

## 2. Write points

- [x] 2.1 Add the principal append to `applyStepEntry`
      (`src/engine/transition.ts`): one
      `INSERT ... ON CONFLICT DO NOTHING` for the entered step's resolved
      candidates, on the same `tx`, beside the `history_entries` insert. Verify
      a submit-driven transition leaves the candidates as principals.
- [x] 2.2 Add the starter append to `createInstance` (`src/engine/store.ts`),
      skipping an instance with no `startedBy`. Verify a created instance holds
      its starter as a principal, and a system-created one holds none.
- [x] 2.3 Add the claimant append to `updateAssignment`
      (`src/engine/transition.ts`) for claim and delegation, not release.
      Verify a delegation target who is not a candidate becomes a principal.
- [x] 2.4 Copy the parent's principals into the child in `createSeededInstance`
      (`src/engine/seeded-create.ts`), with `INSERT ... SELECT` on the creation's
      own transaction, gated on `link` carrying `parent`. Verify a spawned child
      holds every principal the parent held, and that a `process.start` target
      (`link.chainedFrom`) inherits none.
- [x] 2.5 Verify the migration path inherits 2.1 with no code of its own, and
      that what it appends is nothing: a migration carries the instance's
      existing assignment, so a relocation onto a differently assigned step
      adds no principal.
- [x] 2.6 Verify a failed step-entry transaction writes no principal row,
      alongside the instance row and history entry it also does not write.

## 3. Redaction

- [x] 3.1 Delete the instance's principal rows and its denial rows in
      `redactInstance` (`src/engine/retention.ts`), inside its existing
      transaction. Verify neither survives a redaction, and that a failed
      redaction leaves both intact.

## 4. Read

- [x] 4.1 Add a principal-set fragment builder beside `buildInstanceWhere`
      (`src/runtime/api.ts`), folding one ordered, limited `UNION ALL` branch
      per principal the way `buildDataWhere` folds its comparison list. Verify
      it produces the SQL shape design.md fixes, not `principal = ANY(...)`.
- [x] 4.2 Put the denial `NOT EXISTS` INSIDE each principal branch, never
      outside the page limit. Verify a reader with denials still receives a full
      page of `limit` rows, which the outer placement cannot guarantee.
- [x] 4.3 Add the live-assignment set as one further `UNION ALL` branch, reusing
      the `scope=mine` predicate. Verify a revoked actor sees an instance they
      are currently assigned, and stops seeing it once the instance moves to a
      step that does not assign them.
- [x] 4.4 Wire a `visible` scope into `listInstances`, resolving the caller's
      match set from actor id, actor roles and `getGroupsForMember`
      (`src/auth/groups.ts`). Verify a former candidate on a completed instance
      appears and an uninvolved actor gets an empty page.
- [x] 4.5 Extend `parseScope` and `handleListInstances`
      (`src/http/routes.ts`) with the fourth value, treating it as
      participant-facing: no `includeDegraded`, no test instances. Verify an
      omitted `scope` still resolves to `all`.
- [x] 4.6 Verify keyset paging over a `scope=visible` result: a multi-page walk
      returns every instance once and no instance twice.
- [x] 4.7 Verify `scope=visible` combined with an explicit `assignedTo` narrows
      conjunctively and reaches nothing outside the caller's own set.

## 5. Revocation, restore and grant

- [x] 5.1 Add the fifth `Permission` value `"visibility"` to
      `src/auth/authorize.ts`, mapped to `ADMIN_ROLE` in `PERMISSION_ROLE`, and
      extend `grantSchema`'s enum in `src/auth/grants.ts`. Verify
      `can(actor, "visibility", processId, db)` answers true for an operator
      and true for a role holding a matching grant over that process alone.
- [x] 5.2 Add revoke, restore and grant to the Runtime API Layer, each gated by
      `requirePermission(actor, "visibility", <the instance's processId>, db)`.
      Verify an actor holding neither the operator role nor a grant is refused.
- [x] 5.3 Verify a revocation removes the person and not the principal: an
      actor who saw an instance through a group loses it, and every other
      member of that group keeps it.
- [x] 5.4 Verify a revocation survives further step entries that do not assign
      the revoked actor, while the instance still carries a principal they
      match.
- [x] 5.5 Verify no commit path deletes a denial: after a step entry that
      assigns a revoked actor, the denial row still stands. The override is the
      read's third branch (4.3), not a write.
- [x] 5.6 Verify grant: an actor who never took part sees exactly the one
      instance granted, and no other.
- [x] 5.7 Add the `visibility.changed` kind to `instanceEvent`
      (`src/schema/definition.ts`), payload `{op, actorId, byActorId}`. Verify
      `getInstanceRecord` parses it rather than throwing, since
      `instanceEventSchema.parse` rejects an unregistered kind.
- [x] 5.8 Append that event on revoke, restore and grant, in the same
      transaction as the visibility write. Verify each appears in the
      instance's merged record, and that an assignment clearing a revocation
      appends none.
- [x] 5.9 Add the three routes under `/instances/:instanceId/visibility*` in
      `src/http/routes.ts`, beside `handleCancel`. Verify each maps a refusal to
      403, a missing or blank `actorId` to 400, and that no `/admin/*` route
      gains a `requirePermission` gate. An unknown instance maps to 500, not
      404: these throw the Runtime API Layer's `NotFoundError`, which
      `src/http/errors.ts` keeps at 500 by the recorded "Keep not-found at 500"
      decision. The `notFound()` helper serves only the admin CRUD routes,
      whose functions return `undefined` instead of throwing.

## 6. Backfill

- [x] 6.1 Write the backfill script under `scripts/`, deriving principals from
      `body.startedBy`, `body.assignment` (candidates and claimant) and
      `history_entries.actorId`, with `ON CONFLICT DO NOTHING`. Verify it
      populates a pre-existing instance and that a second run changes nothing.
- [x] 6.2 Add the backfill step to `docs/` deployment runbook, next to the
      other one-off migration steps. Verify the runbook names when to run it
      relative to the deploy.

## 7. Performance guard

- [x] 7.1 Add a test that a reader whose match set includes a role most
      instances carry pages in proportion to the page, not the match set.
      Assert against `EXPLAIN (ANALYZE)` output that the rows read from
      `instance_principals` stay bounded, and that no external sort appears.
- [x] 7.2 Add a test that a reader whose match set reaches a small fraction of
      instances pages without a sequential scan over `instance_principals`.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`, then `bun run build`, then the full
      `bun test` with `DATABASE_URL` set. Report the skip count alongside the
      pass count, per the repository's silent-green rule.
- [x] 8.2 Pipe the test run through `scripts/gates/silent-green.sh` and confirm
      it reports no DATABASE_URL-unset run and no skip-floor breach.
- [x] 8.3 Run the prose gate over the changed Markdown
      (`sh scripts/gates/range.sh | sh scripts/gates/prose.sh`) and the
      whitespace gate (`sh scripts/gates/whitespace.sh < /dev/null`). Confirm
      both pass.
- [x] 8.4 Confirm no browser check is needed: this change ships no screen, and
      `packages/web` is untouched.
- [x] 8.5 Replace `docs/decisions.md`'s "Per-instance visibility … stays open"
      paragraph with what this change settled, including the revocation rule and
      the permanently unfiltered aggregate views. Verify the entry no longer
      lists the question as open.
