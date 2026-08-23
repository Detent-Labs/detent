## 1. Data model: the groups store

- [ ] 1.1 Add a `groups` table to `initSchema` (`src/engine/store.ts`):
      `group_id text PRIMARY KEY`, `name text NOT NULL`, `scope jsonb NOT
      NULL`, `members text[] NOT NULL DEFAULT '{}'`. `CREATE TABLE IF NOT
      EXISTS`, the same idempotent pattern `auth_users` uses. No foreign
      key on `members` (design.md's "Members carry no foreign key"
      decision).
- [ ] 1.2 Create `src/auth/groups.ts`, mirroring `src/auth/users.ts`'s
      conventions: `db: SQL = sql` default parameters, a
      `UserSummary`-shaped (`src/auth/users.ts`) `GroupSummary` return (or
      `undefined` for a missing id).
- [ ] 1.3 `createGroup(name, scope, db)`: mints a `group_` id
      (`crypto.randomUUID()`), inserts with an empty `members` array,
      returns the created row.
- [ ] 1.4 `listGroups(page, db)`: keyset pagination on `(name, group_id)`,
      mirroring `listUsers`'s shape and its `DEFAULT_LIST_LIMIT`/
      `MAX_LIST_LIMIT` bounds.
- [ ] 1.5 `renameGroup(groupId, name, db)`, `setGroupMembers(groupId,
      members, db)`, `setGroupScope(groupId, scope, db)`: each an `UPDATE
      ... RETURNING`, keyed by `group_id`, returning `undefined` when no
      such row exists. Each replaces the whole targeted column, matching
      `setRolesById`'s replace-not-merge semantics.
- [ ] 1.6 `getGroupMembers(groupId, db)`: the live-resolution read
      `org.group-members` calls. `SELECT au.user_id FROM auth_users au JOIN
      groups g ON g.group_id = $groupId WHERE au.user_id = ANY(g.members)
      AND NOT au.disabled`, returning `[]` when `groupId` names no group —
      the join alone accounts for that, with no separate existence check.
      The `JOIN` form is required: `x = ANY(subquery)` is the
      subquery/IN-semantics form of `ANY` (the subquery returns one row
      whose column is itself `text[]`), not array-unnesting, and fails
      against live Postgres with `operator does not exist: text = text[]`.
      Joining `groups` lets `ANY` unnest the `members` array column
      directly. One query does the group lookup, the disabled filter, and
      the dangling/nonexistent-member filter together.
- [ ] 1.6b `getGroupScopes(groupIds: string[], db): Promise<Map<string,
      GroupSummary["scope"]>>` in `src/auth/groups.ts`: a batch-by-ids
      lookup mirroring `knownUserIds`'s shape
      (`src/auth/users.ts:130`: `knownUserIds(userIds: string[], db: SQL =
      sql): Promise<Set<string>>`). A missing key in the returned map is
      how a caller detects a nonexistent group id. Test: an existing
      group's scope round-trips through the returned map; a nonexistent
      id is absent from the map.
- [ ] 1.7 `referencingPublishedProcesses(groupId, db)`: an `EXISTS` scan of
      `definitions` filtered to `status = 'published'` whose `body ->
      'allowedGroups'` contains `groupId`, using the `@>` containment
      operator (`(body -> 'allowedGroups') @> to_jsonb(${groupId}::text)`),
      matching the one existing precedent for this exact check
      (`src/runtime/api.ts`'s `candidates @> to_jsonb(...)` array-membership
      filter) rather than the unprecedented `?` existence operator. Verify
      this reads identically to the plain-string-array case (empty or
      absent array yields no match) before finalizing, mirroring
      `src/http/admin-routes.ts::referencingProcesses`'s shape. Returns the
      list of `processId`s (design.md's "share one shape, not one
      function" decision).
- [ ] 1.8 `deleteGroup(groupId, db)`: calls 1.7 first; when it returns a
      non-empty list, deletes nothing and returns that list (the caller
      turns it into a 409); otherwise attempts the delete: returns
      `undefined` when no such `groupId` exists (matching 1.3/1.5 and
      `src/auth/users.ts`), or a distinct `{ deleted: true }`-shaped result
      when a row existed and was removed.
- [ ] 1.9 Test: a created group's `name`, `scope` and `members` round-trip
      through `listGroups`/a direct read.
- [ ] 1.10 Test: `listGroups` pagination, mirroring `listUsers`'s own
      paging test.
- [ ] 1.11 Test: `setGroupMembers` replaces the whole list (an omitted
      member is dropped).
- [ ] 1.12 Test: `setGroupScope` accepts both shapes and round-trips each.
- [ ] 1.13 Test: `getGroupMembers` excludes a disabled account and a
      member id naming no `auth_users` row, and returns `[]` for an
      unknown `groupId`.
- [ ] 1.14 Test: `deleteGroup` refuses and names the referencing process
      when a published process's `allowedGroups` still lists the group;
      succeeds when none does; reports not-found for an unknown `groupId`.
      (Build the published-process fixture via a direct `INSERT INTO
      definitions (...)` SQL statement, mirroring the pattern already
      used in `test/definitions.test.ts` — NOT via `publishBody`, since
      `allowedGroups` is not a recognized `processBody` key until task
      2.1 lands. `referencingPublishedProcesses` reads the fixture's
      `allowedGroups` as raw JSON, so this test does not need section
      2's schema field to exist yet.)

## 2. Definition contract: the allowedGroups field

- [ ] 2.1 Add `allowedGroups: z.array(z.string()).optional()` to
      `processBody` in `src/schema/definition.ts`, so a body predating this
      field keeps parsing and its `definitionHash` stays unchanged
      (design.md's "`.optional()`, not `.default()`" decision). Every read
      site treats an absent `allowedGroups` as empty via `?? []` over the
      compiled `ProcessBody` — task 3.1 already does this; task 5.1 must
      too.
- [ ] 2.2 Confirm every body under `examples/` still parses unchanged (none
      should need editing, since the field is optional). Run the example-
      loading test suite and report the result.
- [ ] 2.3 Test: a body declaring no `allowedGroups` parses successfully,
      with `allowedGroups` reading as `undefined`.
- [ ] 2.4 Test: a body declaring `allowedGroups` with entries parses,
      preserving the entries verbatim.
- [ ] 2.5 Test (hash-stability regression): compute `definitionHash` over a
      raw body literal that predates this field (no `allowedGroups` key at
      all), then parse that same literal through `processBody` and compute
      `definitionHash` again over the parsed result. Assert the two hashes
      are equal, proving `.optional()` keeps `canonicalize()`
      (`src/schema/canonical-json.ts`) from emitting an `allowedGroups` key
      for a pre-change body, so `rehydrate` (`src/engine/store.ts`) still
      matches an already-published instance's pinned `definitionHash`
      (design.md's "`.optional()`, not `.default()`" decision).
- [ ] 2.6 Add `"allowedGroups"` to `KNOWN_KEYS` in
      `packages/web/src/areas/studio/draft/load-guard.ts`, and add
      `expectArray("allowedGroups")` alongside the existing
      `expectArray("dataSources")` call, so a Studio-authored draft that
      adds `allowedGroups` through the JSON view survives the load-time
      shape check instead of failing as an unrecognized top-level field.
      This is a schema-sync fix with no rendered UI surface and no new
      user-facing string (the load guard's error message is already
      field-name-driven), so it is explicitly exempt from the "UI change
      is never trivial" / design-skill-routing rule in the root
      `CLAUDE.md`.

## 3. Structural publish-time check: groupId resolves within allowedGroups

- [ ] 3.1 Add a structural check to `src/schema/compile.ts`, in the style
      of `checkIdResolution`: for every step whose
      `assignment.strategy.type === "org.group-members"` **and whose
      `config?.groupId` is a string**, assert `(body.allowedGroups ??
      []).includes(config.groupId)`, matching the defensive pattern
      `checkIdResolution`'s own `(body.fields ?? [])` already uses. A step
      whose `config.groupId` is absent or non-string is left entirely to
      the assignment-registry config-schema check (task 4) — this
      structural check does not also flag it. A violation reports a
      `CompileIssue` naming the step and the missing group id.
- [ ] 3.2 Append it to `structuralIssues`, so it runs before the
      `publishedProcessBody`-valid idempotent early return in
      `compileProcessBody` and cannot be bypassed by a hand-written body
      that merely satisfies that schema. Update every "eight structural
      checks" occurrence to nine: `src/schema/compile.ts` (lines 4, 22, 130,
      973), `src/validate.ts` (lines 7, 64, 108), and
      `src/engine/definitions.ts` (line 241) — verify these line numbers
      yourself with Grep before editing, since they may have shifted.
- [ ] 3.3 Test: a step whose `org.group-members` `groupId` names an entry
      in `allowedGroups` publishes. Tested via `compileProcessBody` directly,
      per `test/compile-validation.test.ts`'s existing pattern — no
      assignment registry needed, since this check is pure structural
      comparison of two lists already in the body.
- [ ] 3.4 Test: a step whose `org.group-members` `groupId` is absent from
      `allowedGroups` fails the publish, naming the step and the group id.
- [ ] 3.5 Test: the check rejects the violation even on a body that already
      satisfies `publishedProcessBody`, mirroring the unbypassability proof
      pattern `test/compile-validation.test.ts` already uses for its
      sibling structural checks.

## 4. The org.group-members assignment strategy

Note: `publishBody`'s default 6th-parameter registry is the LEAF
`static`-only registry (imported in `src/engine/definitions.ts` from
`./registry.js`). This is NOT the same function as
`assignment-strategies.ts`'s `createDefaultAssignmentRegistry`. That is a
same-named, different function. It also registers `org.manager-of-starter`
and, after this section, `org.group-members`.

A plain 4-argument
`publishBody(...)` call will NOT see `org.group-members`. A test that needs
`publishBody` to recognize `org.group-members` must import
`createDefaultAssignmentRegistry` from `assignment-strategies.js`. It must
pass the resulting registry as the 6th argument. This mirrors how
`test/validate-sequence.test.ts` (lines ~237-246) handles
`org.manager-of-starter` today.

- [ ] 4.1 Add `groupMembersConfigSchema = z.object({ groupId: z.string()
      }).strict()` and `groupMembersStrategyDef` to
      `src/engine/assignment-strategies.ts`, beside
      `managerOfStarterStrategyDef` (it needs `ctx.db`, the same reason
      that strategy lives there and not in leaf `registry.ts`).
- [ ] 4.2 `resolve` calls `getGroupMembers(config.groupId, ctx.db)` (task
      1.6) and returns its result directly; a missing group already
      resolves to `[]` there, so this strategy raises nothing.
- [ ] 4.3 Register `org.group-members` (constant
      `GROUP_MEMBERS_STRATEGY_TYPE`) in `createDefaultAssignmentRegistry`,
      alongside `org.manager-of-starter`.
- [ ] 4.3b Change the two tests that hardcode the default registry's exact
      contents, now stale once 4.3 adds a third entry (Map preserves
      insertion order; the new entry lands after `org.manager-of-starter`,
      matching 4.3's placement):
      `test/assignment-manager-strategy.test.ts`'s `"the shipped registry
      holds both the static entry and the org one"` test — rename it to
      name all three entries, and change its assertion to
      `expect([...reg.keys()]).toEqual(["static",
      MANAGER_OF_STARTER_STRATEGY_TYPE, GROUP_MEMBERS_STRATEGY_TYPE])`; and
      `test/http-studio.test.ts`'s `"GET /registry keeps the type-name
      arrays to exactly those three keys' worth of type names"` test —
      change its `assignmentStrategyTypes` assertion to
      `expect(body.assignmentStrategyTypes).toEqual(["static",
      "org.manager-of-starter", "org.group-members"])`, and rewrite the
      preceding comment (currently "Both entries the shipped registry
      holds: the built-in `static` and the org-aware
      `org.manager-of-starter`") to name all three entries instead of two.
- [ ] 4.4 Test: a step declaring `org.group-members` resolves the group's
      current member list, both members active.
- [ ] 4.5 Test: the resolved list excludes a disabled member.
- [ ] 4.6 Test: a `groupId` naming no group resolves to `[]`, and the step
      entry commits with nothing thrown.
- [ ] 4.7 Test: a membership change made after publishing the process
      reaches the resolved candidates on the next step entry, with no
      republish.
- [ ] 4.8 Test: a config carrying an extra key, or missing `groupId`, is
      refused at publish with a registry validation failure naming that
      strategy's config, going further than
      `manager-of-starter-assignment`'s own config-schema test
      (`assignment-manager-strategy.test.ts`'s schema-only `safeParse`
      check) by exercising the full publish-time rejection path through
      `publishBody`. Per the corrected Note above, this test must
      explicitly `import { createDefaultAssignmentRegistry } from
      '../src/engine/assignment-strategies.js'` (not `registry.js`) and pass
      the resulting registry as `publishBody`'s 6th argument.

## 5. Database-backed scope check

This section implements the `group-scope-validation` capability's ADDED
requirement (`specs/group-scope-validation/spec.md`), not
`definition-contract`'s. See design.md's "share one shape, not one
function" decision for why the check sits in `publishBody` rather than
`compileProcessBody`.

Note: `publishBody`'s default 6th-parameter registry is the LEAF
`static`-only registry (imported in `src/engine/definitions.ts` from
`./registry.js`). This is NOT the same function as
`assignment-strategies.ts`'s `createDefaultAssignmentRegistry`. That is a
same-named, different function. It also registers `org.manager-of-starter`
and, after this section, `org.group-members`.

A plain 4-argument
`publishBody(...)` call will NOT see `org.group-members`. A test that needs
`publishBody` to recognize `org.group-members` must import
`createDefaultAssignmentRegistry` from `assignment-strategies.js`. It must
pass the resulting registry as the 6th argument. This mirrors how
`test/validate-sequence.test.ts` (lines ~237-246) handles
`org.manager-of-starter` today.

- [ ] 5.1 Add a check to `src/engine/definitions.ts` that, for every entry
      in the compiled body's `allowedGroups ?? []`, calls `getGroupScopes`
      (task 1.6b) and confirms the group exists in the `groups` store and
      its scope permits `processId` (`"global"` always permits;
      `"processes"` permits only when `processId` is in `processIds`).
      Treating an absent `allowedGroups` as empty here matches task 2.1's
      `.optional()` schema: an absent field is not a violation, it simply
      has no entries to check.
- [ ] 5.2 Collect every violation (mirroring `RegistryValidationError`'s
      collect-all-issues style) into a dedicated `GroupScopeValidationError`
      type thrown on any violation, naming each offending group id and the
      reason (not-found vs. scope-mismatch).
- [ ] 5.2b Register `GroupScopeValidationError` in `src/http/errors.ts`'s
      `ISSUES_ERRORS` table, mirroring how `RegistryValidationError` is
      registered (same collect-all-issues shape): `{ ctor:
      GroupScopeValidationError, status: 422, type:
      "group-scope-validation" }`. Test: one HTTP-level test through
      `handlePublish` (not `publishBody` directly), asserting the response
      is 422 and the body's `issues` name the offending group id.
- [ ] 5.3 Call it from `publishBody` at the same relative position
      `validateCrossProcess`/`validateProcessChaining` already occupy:
      after the hash-hit idempotent no-op return, after the in-process
      `validateReferences`/CEL checks, using the same per-request `db`
      parameter `publishBody` already threads through those two calls.
      Nothing above this call may persist first.
- [ ] 5.4 Test: an `allowedGroups` entry naming a `"global"`-scoped group
      publishes for any process.
- [ ] 5.5 Test: an `allowedGroups` entry naming a `"processes"`-scoped
      group publishes when the publishing process's id is in that group's
      `processIds`, and fails when it is not, naming the group id.
- [ ] 5.6 Test: an `allowedGroups` entry naming no group in the store fails
      the publish, naming that group id.
- [ ] 5.7 Test (the placement proof): publish a body once so its hash is
      stored; rescope a group its `allowedGroups` names so it no longer
      permits this process; publish the byte-identical body again; assert
      the second call returns the existing version and throws nothing,
      proving the check sits after the hash-hit no-op return.
- [ ] 5.8 `GroupScopeValidationError`'s new `group-scope-validation` type
      (task 5.2b) also needs `packages/web`'s own publish-error
      classification, or the located group-id/reason detail this
      capability exists to surface falls through to a generic message.
      `packages/web/src/api/client.ts`'s `PUBLISH_VALIDATION` set (verify
      the current line with Grep — was line 64) holds exactly five type
      strings, plus `cross-process-validation` handled separately, six
      total (its own comment, immediately above, says "six publish-time
      error classes" — was line 63). Add `"group-scope-validation"` to the
      set and update that comment to seven.
      `packages/web/src/areas/studio/errors.ts`'s comment above the
      `publish-validation` case (verify the current lines with Grep — was
      lines 45-48), "these six come from the publish chain's own
      validators," becomes "these seven."
      `packages/web/test/studio-publishErrors.test.ts`'s header comment
      (verify the current lines with Grep — was lines 5-6), "The six
      publish-time rejections," becomes "The seven publish-time
      rejections," and the file gains a `kind: "group-scope-validation"`
      test case mirroring its existing kind-based assertions.

## 6. Admin HTTP routes: /admin/groups*

- [ ] 6.1 Add six handlers to `src/http/admin-routes.ts`, each gated by
      `requireRole(actor, ADMIN_ROLE)` through the shared `route` helper,
      mirroring `handleAdminListUsers` and its siblings:
      `handleAdminListGroups`, `handleAdminCreateGroup`,
      `handleAdminRenameGroup`, `handleAdminSetGroupMembers`,
      `handleAdminSetGroupScope`, `handleAdminDeleteGroup`.
- [ ] 6.2 `handleAdminCreateGroup` and `handleAdminSetGroupScope` validate
      the request body's `scope` against the two-shape discriminated union
      (task 1.2's schema), returning 400 for a body matching neither shape.
      `handleAdminCreateGroup` and `handleAdminRenameGroup` trim and
      reject an empty `name`, mirroring the admin-user route pattern:
      `handleAdminSetUserName` calls `validateDisplayName`
      (`src/auth/users.ts`) at the route layer, before it calls
      `setDisplayName`, and rejects an empty-after-trim value there rather
      than delegating to the data-layer function — `createUser`/
      `setDisplayName` themselves only coerce an empty value to `null`
      (via `normalizeDisplayName`), they do not reject it. The two group
      handlers run an analogous trim-and-reject-empty check before calling
      `createGroup`/`renameGroup`, not inside `src/auth/groups.ts` — task
      6.2b's `validateGroupName` is that check.
- [ ] 6.2b Add `GROUP_NAME_MAX_LENGTH = 200` to `src/auth/groups.ts`,
      mirroring `DISPLAY_NAME_MAX_LENGTH` in `src/auth/users.ts`
      (design.md's Decisions section: a group `name` gets the same
      200-character bound `auth_users.display_name` and `grants.ts`'s
      `role` string already carry, for the same reason). Add
      `validateGroupName(value: string): { ok: true; name: string } | {
      ok: false; reason: "empty" | "too-long" }`, mirroring
      `validateDisplayName`'s shape: trims the value, returns `{ ok:
      false, reason: "empty" }` for an empty-after-trim result, and `{ ok:
      false, reason: "too-long" }` past `GROUP_NAME_MAX_LENGTH`. Call it
      from `handleAdminCreateGroup` and `handleAdminRenameGroup` (task
      6.2) before `createGroup`/`renameGroup`, returning 400 on either
      `reason`.
- [ ] 6.3 `handleAdminDeleteGroup` maps `deleteGroup`'s three outcomes: 404
      for an unknown `groupId`; 409 with `{ error: { type: "conflict",
      message: ..., processIds: [...] } }` naming every blocking process id
      (the data-list precedent's message-only body does not carry ids —
      this route's body must add a `processIds` array); 200 for a completed
      delete. The wire type stays the generic `"conflict"` several other
      409s in this codebase already use (data list already exists, data
      list referenced, outbox dead-letter); this route's body adds a
      `processIds` array none of those others carry. `admin-groups-screen`'s
      `parseErrorBody` (its design.md, task 1.2, task 2.9) detects this
      case by shape-sniffing, not by a dedicated wire type: it checks
      `type === "conflict"` plus a `processIds` array present, and only then
      maps the response to its own client-side `"group-referenced"`
      `ClientError` variant. That shape-sniffing convention is why the wire
      type here must stay `"conflict"`.
- [ ] 6.4 Register the six routes in `src/http/server.ts`: `GET
      /admin/groups`, `POST /admin/groups`, `PATCH
      /admin/groups/:groupId/name`, `PATCH
      /admin/groups/:groupId/members`, `PATCH
      /admin/groups/:groupId/scope`, `DELETE /admin/groups/:groupId`,
      alongside the existing `/admin/users*` entries.
- [ ] 6.5 Test: `GET /admin/groups` lists and paginates.
- [ ] 6.6 Test: `POST /admin/groups` creates, and refuses an empty `name`.
- [ ] 6.6b Test: `POST /admin/groups` refuses a `name` past
      `GROUP_NAME_MAX_LENGTH` (200 characters) with 400, and creates no
      group.
- [ ] 6.7 Test: `PATCH /admin/groups/:groupId/name` renames, and 404s for
      an unknown `groupId`.
- [ ] 6.7b Test: `PATCH /admin/groups/:groupId/name` refuses a `name` past
      `GROUP_NAME_MAX_LENGTH` (200 characters) with 400, and leaves the
      group's stored name unchanged.
- [ ] 6.8 Test: `PATCH /admin/groups/:groupId/members` replaces the whole
      member list.
- [ ] 6.9 Test: `PATCH /admin/groups/:groupId/scope` accepts both scope
      shapes, 400s for neither, and succeeds even when narrowing scope out
      from under a published process's `allowedGroups` reference
      (design.md's "Narrowing scope after publish succeeds" scenario).
- [ ] 6.10 Test: `DELETE /admin/groups/:groupId` refuses and names the
      blocking process for a referenced group, succeeds for an
      unreferenced one, and 404s for an unknown `groupId`.
- [ ] 6.11 Test: an actor lacking `system:admin` gets 403 from each of the
      six routes, with no read or write performed.

## 7. Documentation

- [ ] 7.1 Extend `docs/authoring-guide.md`: document `allowedGroups` and
      the `org.group-members` strategy, alongside the existing
      `static`/`org.manager-of-starter` documentation. Also fix line 577's
      "Two strategies ship." — accurate today, but stale once this change
      ships a third — to "Three strategies ship."
- [ ] 7.1b Extend `docs/current-state.md`. Two clauses there need the same
      fix: the passage a few lines above, at ~line 641-642
      ("`\"static\"` ... is the entry an author gets by default and the
      only one that ships"), is already false today, since
      `org.manager-of-starter` already ships — correct it to name three
      strategies, mirroring how task 7.2b fixes the equivalent claim in
      `process-contract.md`. Then, at ~line 644, "a second entry now
      ships beside it: `\"org.manager-of-starter\"`": name three
      strategies instead of two. Cite
      `assignment-strategies.ts::createDefaultAssignmentRegistry` for
      both. Also update the "eight structural checks" occurrence at ~line
      207 to nine, matching task 3.2's fix to the same phrase elsewhere.
- [ ] 7.1c Extend `docs/decisions.md` (~line 135-136, "Two strategies now
      ship: `\"static\"` and `\"org.manager-of-starter\"`"): name three
      strategies instead of two, citing the same source.
- [ ] 7.2 Extend `.claude/rules/authoring-invariants.md`: add the
      structural `groupId`-in-`allowedGroups` check (task 3.1) to the
      write-path check list, following the existing bullet format and
      citing `definition-contract`'s placement rule the way
      `checkIdResolution`'s own bullet does.
- [ ] 7.2b Extend `.claude/rules/process-contract.md`'s Extensibility
      section: append one sentence naming the new group-scope publish-time
      check (task 5.1) and its placement alongside `validateCrossProcess`/
      `validateProcessChaining`. In the same edit, correct that section's
      now-doubly-false claim that `"static"` is "the type an author gets by
      default, and the only one that ships": `org.manager-of-starter`
      already ships, and this change adds a third, `org.group-members`.
      Replace that clause with wording naming all three, e.g. "the type an
      author gets by default; `org.manager-of-starter` and
      `org.group-members` also ship." This edit lands during
      `/openspec-apply-change`, not during plan review.
- [ ] 7.2c No implementation task for `assignment-strategy-registry`'s
      MODIFIED requirement: `AssignmentContext.db` already exists in code
      (`src/engine/registry.ts`). This delta only corrects the base spec's
      stale claim that no such handle travels in the context; nothing to
      build.
- [ ] 7.3 Run the antislop check over all five files, and over this change's
      own artifacts (`proposal.md`, `design.md`, `tasks.md`, and each file
      under `specs/`). Clear every finding, or add a targeted `<!--
      antislop: allow <rule> -->` with a one-line reason where a rule
      misfires.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`, and report what it printed.
- [ ] 8.2 Run `bun run build`, and report what it printed.
- [ ] 8.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun), and report the pass count and the skip count.
- [ ] 8.4 Check the skip count against `scripts/gates/skip-floor.txt`.
- [ ] 8.5 Run `sh scripts/gates/prose.sh < /dev/null`.
- [ ] 8.6 Run `sh scripts/gates/whitespace.sh < /dev/null`.
