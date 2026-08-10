## 1. Baseline

- [x] 1.1 Read the expected `definitionHash` values `test/view-layout-hash.test.ts`
      already records. They are the target. No later task edits them.
- [x] 1.2 Capture the full `bun run typecheck` output on zod 3.25.76, so a
      later run shows which errors the migration introduced and which it
      inherited.

## 2. The bump

- [x] 2.1 Set the zod `dependency` to an exact `4.4.3` in `package.json` and
      `packages/web/package.json`. No caret, no tilde. Set the zod
      `peerDependency` in `packages/form-ui/package.json` to `^4.4.3`, which
      stays a range because a peer declares compatibility rather than
      resolution.
- [x] 2.2 Run `bun install` and commit the resulting `bun.lock`. Confirm the
      lockfile resolves one zod, not two.
- [x] 2.3 Run `bun run typecheck` and capture the error list. This list drives
      groups 3 through 6.

## 3. Cluster A: type-level renames

- [x] 3.1 `src/schema/definition.ts`: drop `z.ZodTypeDef` from `fieldDef`'s
      annotation at line 259, keeping the output and input parameters.
- [x] 3.2 `src/schema/compile.ts`: replace `z.AnyZodObject` at line 194 with
      v4's object type.
- [x] 3.3 `src/http/routes.ts`: give `z.record()` a key schema at lines 56 and
      110. The inferred value type stays as it is today.

## 4. Cluster B: `compile.ts::unwrapSchema`

- [x] 4.1 Rewrite `unwrapSchema` against v4's node shape. Keep the lazy,
      optional, nullable and default branches. Remove the `ZodEffects` branch,
      which v4 makes dead.
- [x] 4.2 Confirm `shapeKeys` reads `.shape` from `authoredProcessBody` and
      `publishedProcessBody` directly, since v4's `refine` returns the same
      type. Simplify the call if the unwrap step is now redundant.
- [x] 4.3 Assert that every `*_KEYS` constant in `compile.ts` holds a non-empty
      set, and that each one contains a key the schema declares. There are 21 of
      them, built at module load. An empty set silently disables
      `checkUnknownKeys` for that level rather than failing the compiler.
- [x] 4.4 Run the compile and definition suites. A key the wrapper stopped
      reaching shows up as a validation gap, not a compiler error, so read the
      named failures rather than the pass count.

## 5. Cluster C: `config-descriptor.ts`

- [x] 5.1 Move the seven `_def` reads to v4's node shape: `.checks` at two
      sites, `.minLength`, `.maxLength`, `.values`, `.shape()` and
      `.defaultValue()`. The check list changes shape, not only location.
- [x] 5.2 Derive `format: "email"` against v4. `describeString` reads
      `check.kind === "email"` today, and v4 restructures string formats. This
      is the subtlest of the seven reads, because a miss drops the format
      silently rather than failing.
- [x] 5.3 Rewrite the module's header comment. Its description of `ZodEffects`
      wrapping a refined object no longer describes v4.
- [x] 5.4 Add a test asserting that a config schema carrying a cross-field rule
      yields a descriptor rather than `undefined`. This covers the widening the
      delta spec states.
- [x] 5.5 Add a test asserting that publish still rejects a config that breaks
      the cross-field rule, through `registry-check.ts`.
- [x] 5.6 Add a test asserting that a per-field rule on such a schema still
      yields the descriptor entry the studio renders an inline error from. This
      covers the delta spec's second scenario.
- [x] 5.7 Confirm a schema the converter cannot represent still yields
      `undefined`, so the raw JSON path stays reachable.

## 6. Cluster D: downstream inference

- [x] 6.1 Read the remaining `bun run typecheck` errors in
      `src/engine/migration.ts`, `src/engine/outbox.ts` and
      `src/runtime/api.ts`. Name the cause before editing. The likeliest cause
      is `z.record` over the branded id types.
- [x] 6.2 Fix each one at the schema that produces the inference, not at the
      call site, where the two differ. A cast at a call site hides a changed
      contract type.
- [x] 6.3 Run `bun run typecheck` to zero errors.

## 7. The browser packages

- [x] 7.1 Compile `packages/web` and `packages/form-ui` against v4 and fix what
      the filtered typecheck reports.
- [x] 7.2 `packages/web/src/areas/studio/registry/exampleRegistry.ts` is the one
      browser file importing zod. It calls `z.string().url()` and
      `z.string().email()`, which v4 marks deprecated in favour of `z.url()` and
      `z.email()`. Both still compile, so this is a rewrite for the deprecation,
      not a fix for a break.
- [x] 7.3 Confirm `packages/web/src/areas/studio/api/types.ts` still mirrors
      `ConfigFieldDescriptor` correctly. The type is hand-mirrored, so no
      compiler check links the two.

## 8. The hash gate

- [x] 8.1 Run `test/view-layout-hash.test.ts`. It passes with the values from
      1.1 unedited. A mismatch means a v4 parse emits a different body, which
      is a defect in this change, never a reason to record a new hash.
- [x] 8.2 On a mismatch, diff the parsed body against the 3.25.76 parse of the
      same source to find the added or dropped key. Fix the schema so the parse
      output matches, then run 8.1 again.

## 9. Documentation

- [x] 9.1 Set ROADMAP stage 28 to DONE, naming the change and the two specs.
- [x] 9.2 Check whether `docs/current-state.md` describes
      `config-descriptor.ts`'s supported subset. Rewrite it if it names the
      refined-schema exclusion.

## 10. Verification

- [x] 10.1 `bun run typecheck`, then `bun run build`. Report what each printed.
- [x] 10.2 The full `bun test` with `DATABASE_URL` set, in the devcontainer.
      Report the pass count and the skip count. A skip count above the floor
      fails the run.
- [x] 10.3 `bun run test:tz`. It pins a timezone-sensitive suite in
      `packages/web` that the default run does not cover, and `bun run check`
      runs it on every push.
- [x] 10.4 The antislop linter over every Markdown file this change touched.
- [x] 10.5 `git diff --check`, then `git ls-files --eol` read on the `w/`
      column.
- [x] 10.6 A browser pass on the studio plugin config form, covering a
      schema-backed type, a type carrying a cross-field rule, and a schema-less
      type. Confirm the inline per-field error still appears on the second.
      Record the result in `docs/browser-checks.md` if it belongs there.
- [x] 10.7 Close PR #9, naming this change.
