## 1. Read the two suites first

- [x] 1.1 Read `test/subprocess.test.ts`'s assertions on
      `mapping.entry-dropped` and `assignment.unresolved`. Note which
      instance id each expects.
- [x] 1.2 Read the same assertions in `test/process-chaining.test.ts`.
- [x] 1.3 Record the two expectations in a comment on
      `createSeededInstance`: drop events carry the source instance, the
      unresolved event carries the created one. Name both test files in that
      comment. `test/process-chaining.test.ts:117` reads
      `instance_events … kind = 'mapping.entry-dropped'`, so a later reader
      who doubts the comment finds the assertion in one step.

## 2. The shared loaders

- [x] 2.1 Add `parseInstance` to `src/engine/store.ts`. Exported, not
      private: the return handler's locked `FOR UPDATE` read needs it too,
      which `loadInstance`'s unlocked SELECT cannot serve. See the note this
      change adds to `PONYTAIL-AUDIT.md`'s resolution entry.
- [x] 2.2 Add and export `loadInstance(db, instanceId)` to `store.ts`. It is
      the body of `subprocess.ts:57-60`, unchanged.
- [x] 2.3 Delete both copies from `src/engine/subprocess.ts` and import the
      shared ones. Its three remaining `loadInstance` calls sit at lines 86,
      179 and 181; the return handler's `parseInstance` call stays, now
      imported.
- [x] 2.4 Delete both copies from `src/handlers/process-start.ts` and import
      the shared one. Its two remaining calls sit at lines 64 and 77.

## 3. `createSeededInstance`

- [x] 3.1 Create `src/engine/seeded-create.ts` and write the function there,
      with the signature in design.md. It does NOT go in `store.ts`: that
      module's persistence-only remit forbids the CEL evaluation and the
      resolver call this function makes. Import `createInstance`,
      `withTransaction`, `appendInstanceEvent`, `newInstanceEventId` and
      `makeAssignmentUnresolvedEvent` from `./store.js`, `evalFieldMap`,
      `buildGuardContext` and `SYSTEM_ACTOR` from `../cel/eval.js`, and
      `resolveStepAssignment` from `./registry.js`.
- [x] 3.2 Write the five steps in the order design.md lists them. Move the
      `withTransaction`-nests-as-a-savepoint comment with the code. Keep one
      copy of it.
- [x] 3.3 Spread the `link` union into the `createInstance` call, so a
      `parent` caller writes `parent` and a `chainedFrom` caller writes
      `chainedFrom`.
- [x] 3.4 Return the created `Instance`.

## 4. `makeSpawnHandler`

- [x] 4.1 Replace `subprocess.ts:112-164` with one `createSeededInstance`
      call. Pass `spec.inputMapping`, the parent as the source, and
      `link: { parent: { instanceId: parentId, stepId: subprocessStepId } }`.
- [x] 4.2 Keep the parent-status guard at :87 where it is. Keep the target
      resolution at :95-106. Keep the error messages.
- [x] 4.3 Keep the drive-to-rest at :172 and the cancel-race backstop at
      :174-183 unchanged.

## 5. `processStartHandler`

- [x] 5.1 Replace `process-start.ts:88-148` with one `createSeededInstance`
      call. Pass `config.inputMapping`, the acting instance as the source,
      and `link: { chainedFrom: acting.instanceId }`.
- [x] 5.2 Keep the redelivery branch at :64-71, the `resolveLatest` target
      resolution at :73-75 and the two throws at :78 and :81.
- [x] 5.3 Create one `createDefaultAssignmentRegistry()` per delivery. Pass it
      to `createSeededInstance` and to the `resolveAutomatic` call at :155.
      Delete the second construction.

## 6. Documents

- [x] 6.1 In `PONYTAIL-AUDIT.md`, add finding 12 to the "Resolved from the
      2026-08-16 scan" section, in the format the existing "Resolved from"
      sections use.
- [x] 6.2 Record the two corrections: the audit names three differences, and
      five exist. Name the source-instance guard and the injection style.
      design.md carries the measurement for each.
- [x] 6.3 Drop finding 12 from the paragraph near the file's end that lists
      the findings worth their own change.
- [x] 6.4 Check `docs/current-state.md`'s subprocess and process-chaining
      sections against the new seam. Correct any sentence naming a helper
      that moved.
- [x] 6.5 Correct `src/engine/registry.ts:209-212`. That comment lists
      `resolveStepAssignment`'s callers. It names the subprocess spawn
      handler and misses `process.start`, which calls the resolver at
      `process-start.ts:107` today. After this change one caller covers
      both: name `createSeededInstance`. Keep the sentence excluding
      `createInstance` and `planStepEntry` as it stands.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`. Report what it printed.
- [x] 7.2 Run `bun run build`. Report what it printed.
- [x] 7.3 Run the full `bun test` with `DATABASE_URL` set. Report the pass
      and the skip count, not the pass count alone.
- [x] 7.4 Confirm by name that `test/subprocess.test.ts` and
      `test/process-chaining.test.ts` passed. They are the evidence that
      behavior held.
- [x] 7.5 Run the antislop linter over every Markdown file this change
      touched.
- [x] 7.6 Run `git diff --check`, and `git ls-files --eol` for CRLF.
