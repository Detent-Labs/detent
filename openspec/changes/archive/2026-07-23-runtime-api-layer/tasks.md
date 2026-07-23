## 1. Engine extensions (additive)

- [x] 1.1 Add `resolveLatest(processId)` to `createDefinitionStore`'s returned
      object in `src/engine/definitions.ts` (newest published `{ version, body }`
      for a `processId`, `undefined` if none), mirroring `resolveLatestByContract`
      minus the contract-hash filter
- [x] 1.2 Split `executeManualTransition` in `src/engine/transition.ts` into
      `commitManualTransition` (guard check + commit, no cascade) and
      `executeManualTransition` (= `commitManualTransition` +
      `resolveAutomatic`), preserving `executeManualTransition`'s exported
      signature and behavior for every existing call site
- [x] 1.3 Add an optional `dataPatch?: Record<FieldId, Literal>` parameter to
      both functions. When supplied, `commitManualTransition` must:
      (a) compute `mergedData = { ...instance.data, ...dataPatch }` — the
      full object, never `dataPatch` alone;
      (b) evaluate the path's guard against `{ ...instance, data: mergedData }`;
      (c) pass an instance carrying `mergedData` as `commitTransition`'s base
      `instance` argument (so target-step timer arming and the returned
      in-memory `Instance` both reflect the merged data, not the pre-patch
      data);
      (d) pass `{ data: mergedData }` as `applyStepEntry`'s `extraFields` —
      the *full* merged object, since `body || extraFields::jsonb` is a
      shallow top-level merge in Postgres and a partial `data` value would
      replace, not extend, the persisted `data` object
- [x] 1.4 Add/extend tests in `test/transition.test.ts` (or
      `test/engine.test.ts`) for `dataPatch`: guard sees merged data; a
      patch covering only some fields commits without erasing the others;
      the target step's armed timers and the returned instance both reflect
      merged data; `executeManualTransition` with a patch equals
      `commitManualTransition` + `resolveAutomatic`; omitting `dataPatch`
      leaves both functions' behavior byte-identical to before

## 2. Runtime module scaffolding

- [x] 2.1 Create `src/runtime/api.ts` with an internal `createDefinitionStore`
      instance owned by the module (callers never touch `ProcessBody` directly)
- [x] 2.2 Define `SubmissionValidationError` and `SubmissionIssue` (the seven
      issue kinds: `unknown-field`, `readonly-field`, `type-mismatch`,
      `invalid-option`, `constraint`, `rule-failed`, `required-missing`)
- [x] 2.3 Define `InstanceView`, `ResolvedViewField`, `AvailablePath` types

## 3. View resolution (shared helper)

- [x] 3.1 Implement an internal helper that resolves a step's `ViewField`s
      against the field catalog and current data into `ResolvedViewField[]`:
      evaluate `visible`/`required`/`readonly` (a plain `boolean` used as-is,
      an `Expression` via `evalGuard`'s total semantics against
      `buildGuardContext(body, instance, actor)`); omit fields resolving
      invisible; for a `ViewField` whose `ref` resolves to a `FieldDef` of
      `type: "group"`, force `required`/`readonly` to `false` and `value` to
      `undefined` regardless of the view's own declaration or `instance.data`
- [x] 3.2 Implement an internal helper that resolves the current step's manual
      paths into `AvailablePath[]`, keeping only those whose guard evaluates
      `true` against the same context (guardless paths always included)
- [x] 3.3 Implement an internal helper deriving the visible-and-required and
      visible-and-editable (`visible && !readonly`) field-id sets from 3.1's
      output, **excluding group-container refs from both** — shared by
      `getInstanceView`'s consumers, the field-set boundary, and the required
      check, so there is exactly one implementation of "which fields count"
- [x] 3.4 Implement `getInstanceView(instanceId, actor, db?)` using 3.1-3.3
      via the ordinary unlocked rehydrate/peek path; works for any instance
      status, `status` always present

## 4. Submission validation

- [x] 4.1 Implement per-field type-match validation mirroring
      `check.ts::celType`'s baseFieldType mapping (string-like types require
      JS `string`, `number`→JS `number`, `boolean`→JS `boolean`,
      `multiselect`→array of strings, `file`/plugin type→opaque/accepted),
      against merged (not-yet-committed) data
- [x] 4.2 Implement option-membership validation: when `FieldDef.options` is
      non-empty, the submitted value (each item for `multiselect`) must equal
      one `option.value`; else `invalid-option`
- [x] 4.3 Implement constraint validation (`min`, `max`, `minLength`,
      `maxLength`, `pattern`)
- [x] 4.4 Implement `validation.rule` CEL evaluation (total semantics)
      against `buildGuardContext(body, mergedInstance, actor)` — no
      `result`, no `child`
- [x] 4.5 Implement the field-set boundary check using 3.3's
      visible-and-editable set (submitted keys must be in it, group-container
      refs excluded) producing `unknown-field` / `readonly-field` issues
- [x] 4.6 Implement the required check (as an opt-in flag, `submitAndTransition`
      only — NOT `createProcessInstance`, since requiredness is a
      transition-time gate, not an existence-time one; see design.md) over
      the full merged data using 3.3's visible-and-required set, independent
      of which keys were submitted; note a declared `FieldDef.default` does
      not satisfy this (nothing applies `default` anywhere in the engine —
      not in scope for this change)
- [x] 4.7 Collect all located issues (not fail-fast) into one thrown
      `SubmissionValidationError`

## 5. Public operations

- [x] 5.1 Implement `createProcessInstance(processId, actor, opts?, db?)`:
      resolve version (`resolveLatest` or `opts.version`); mint the instance
      id up front and build a stub `Instance` (transitionSeq 0, initial step,
      status derived the way `store.ts::createInstance` derives it) to
      validate `opts.data` against, using section 4's validation with the
      required check turned OFF (creation never enforces requiredness — see
      design.md); on success call `store.ts::createInstance` with that same
      minted `opts.instanceId`, then `resolveAutomatic`
- [x] 5.2 Implement `submitAndTransition(instanceId, pathId, data, actor,
      db?)`: open a transaction; read the instance row with `SELECT ... FOR
      UPDATE` (not `rehydrate`'s unlocked read); parse it, resolve its
      pinned `ProcessBody`, and hash-verify the pin (mirroring
      `resolution.ts`'s peek→resolve→verify pattern, throwing `PinMismatch`
      on mismatch); run the field-set boundary + validation (section 4)
      against the pre-submission committed data; build the merged instance
      and confirm the target path's guard; call `commitManualTransition(
      instance, pathId, body, actor, tx, data)` — passing the open
      transaction so `commitTransition`'s `withTransaction` joins via
      `savepoint` instead of nesting a `begin`
- [x] 5.3 After 5.2's transaction commits, call `resolveAutomatic(committed,
      body, actor, db)` with the plain (unlocked) `db` — deliberately outside
      the locked transaction, matching every other caller's cascade
      granularity; let `AutomaticCascadeLoop` propagate uncaught (the commit
      has already landed by this point)
- [x] 5.4 Verify the error-handling summary end to end: `SubmissionValidationError`
      on invalid data, existing `GuardRefused` on a failing merged guard,
      existing `ConcurrencyConflict` on a race, existing `PinMismatch` on a
      stale pin, plain `Error` on an unresolvable `processId`/`version`,
      existing `AutomaticCascadeLoop` on a post-commit cascade loop (instance
      left `faulted`, data/transition already committed)

## 6. Tests

- [x] 6.1 Create `test/runtime-api.test.ts` (DB-backed, `bun:test`): one test
      per validation issue kind that must reject a violating submission,
      including `invalid-option` for a `select`/`multiselect` field
- [x] 6.2 Add a happy-path create → view → submit → view round trip against
      `examples/expense-approval.json`
- [x] 6.3 Add a test that a submission covering only some fields preserves
      every other previously stored field of `data` (guards against the
      jsonb shallow-merge data-loss failure mode)
- [x] 6.4 Add a test that `availablePaths` reflects guard state as data
      changes across two submissions, and that a guard on the step the
      submission transitions into sees the just-submitted data (guards
      against the resolveAutomatic-sees-stale-data failure mode)
- [x] 6.5 Add a test that a concurrent `Action.output` writeback landing
      between `submitAndTransition`'s locked read and its commit is not lost
      (guards against the missing-row-lock failure mode)
- [x] 6.6 Add a `ConcurrencyConflict` test: a stale, unlocked
      `executeManualTransition` call (holding an `Instance` snapshot read
      before a `submitAndTransition` call commits) throws
      `ConcurrencyConflict` once `submitAndTransition`'s commit has landed —
      not a race between two `submitAndTransition` calls, which serialize via
      the row lock instead of conflicting (see design.md)
- [x] 6.7 Add a `getInstanceView` test against a non-`running` (completed or
      cancelled) instance
- [x] 6.8 Add a `getInstanceView` test against a subprocess wait-state step
      (empty `availablePaths`, correct `status`)
- [x] 6.9 Add a test for a view field referencing a group-container
      `FieldDef`: never reports `required: true` even when the view declares
      it, and a submission naming that field's id is rejected as
      `unknown-field`

## 7. Verification

- [x] 7.1 Run `bun run typecheck` (`tsc --noEmit`) inside the devcontainer
- [x] 7.2 Run `bun test` with `DATABASE_URL` set inside the devcontainer;
      confirm no DB-backed suites silently skip
- [x] 7.3 Confirm existing `test/transition.test.ts` / engine suites still
      pass unchanged (no regression from the `executeManualTransition` split
      or the additive `dataPatch` parameter)
