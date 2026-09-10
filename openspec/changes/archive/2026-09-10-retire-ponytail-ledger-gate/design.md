## Context

See `proposal.md` for motivation. Six facts fix the shape of this change. Each
one was measured on this tree on 2026-09-10.

**The gate's reach.** `scripts/gates/ponytail-ledger.sh` is 35 lines. Line 22
reads `[ -f PONYTAIL-DEBT.md ] || exit 0`. Lines 24 and 25 then compare the
ledger's path set against `git grep -l 'ponytail:' -- src packages`. Both
ledgers sit in `.gitignore:51-52`. The comparison therefore runs on the one
machine holding the files, and nowhere else.

**The gate's call sites.** There are three. The hook runs it first, at
`.githooks/pre-push:50`. The CI workflow runs it as a step, at
`.github/workflows/check.yml:50-51`. That step sits under a comment reading
"The four gates that need only git and a shell". The table at `CLAUDE.md:195`
lists it as the third site.

The research behind this change named the hook and the table. It missed the CI
step. Leaving that step would break the workflow on the first push.

**The ledger's content.** `PONYTAIL-DEBT.md` holds 19 rows over 16 files, each a
`what` / `ceiling` / `upgrade` template. The `ponytail:` comments in the source
already carry those three fields. `src/tenancy/connections.ts:8`,
`src/engine/reporting.ts:137` and `src/engine/outbox.ts:48` each read that way.
The ledger is a reformatting of the comments.

**The ledger's drift.** Nineteen `path:line` claims, four of them wrong:
`src/engine/store.ts:721` is 722, `store.ts:1123` is 1124,
`packages/web/src/areas/studio/canvas/traversal.ts:175` is 181, and
`packages/web/src/areas/admin/screens/InstanceScreen.tsx:40` is 150. The gate
compares path sets alone, so it passes over all four.

**The audit's content.** `PONYTAIL-AUDIT.md` is 1021 lines. Lines 89 to 144 hold
one open finding. Lines 145 to 438 hold the refusal record this change
preserves. Lines 439 to 1021 hold resolved history, which 13 archived
`*ponytail*` changes already carry.

**The dead citations.** Six tracked files cite a finding number by name. A grep
for `^ *(1|2|7|9|65|66)\. ` in `PONYTAIL-AUDIT.md` returns nothing. Those six
citations are dangling on this machine today, not only on a fresh clone.

## Goals / Non-Goals

**Goals:**

- Delete the gate, its regenerator, and all three of its call sites.
- Give the `ponytail:` marker convention its first official definition, in
  `openspec/specs/push-gate-checks/spec.md`.
- Move the audit's one open finding and its refusal record into
  `docs/decisions.md`, rewritten to clear the prose gate.
- Repoint the six dead finding-number citations at the archived change that
  closed each one.

**Non-Goals:**

- Tracking either ledger. See Decision 1.
- Replacing the gate with a lighter one. See Decision 1.
- Rewriting the 13 archived `*ponytail*` changes, or the resolved-history block
  at `PONYTAIL-AUDIT.md:439-1021`.
- Acting on finding 11. This change records it as an open decision. The router
  rewrite needs an OpenSpec change of its own.
- Resolving the contradiction between `development-toolchain/spec.md:383` and
  the presence of `.github/workflows/check.yml`. That spec line forbids a
  hosted-CI workflow, and the file exists. This change edits one step of that
  workflow and leaves the contradiction where it found it.
- Editing the three `PONYTAIL` citations in `docs/CODE_REVIEW.md:488` and
  `docs/CODE_REVIEW-2026-07-29.md:376,530`. The second change in the sequence
  moves both files into the OpenSpec archive unchanged, and the archive keeps
  its history. The reference sweep in `tasks.md` excludes them on purpose.

## Decisions

### Decision 1: Retire the gate rather than repair it

Three repairs were available. Each one failed on a measurement.

**Track both ledgers and keep the gate.** Rejected. The repair path the gate
prints is `sh scripts/ponytail-ledgers.sh`. That script's engine is a
`claude -p` call on the host. It is non-deterministic, needs the network, and
the devcontainer cannot make it. No other gate puts an LLM call in front of a
push. The script also rewrites both files. A debt-only fix can therefore churn
1021 lines of audit prose, and trip the prose gate.

**Track `PONYTAIL-DEBT.md` alone.** Rejected, despite costing nothing at the
prose gate. That file measures antislop exit 0, so its five warnings score zero
against a base of zero. It fixes no citation: all six dead citations name
`PONYTAIL-AUDIT.md`. It buys an honest table row and leaves the cited half
untracked.

**Keep the gate against a deterministic path manifest.** Rejected. The manifest
would list 16 paths. Its only content is what the comparison command already
prints. It would exist so that drift shows as a diff. That guards a duplicate
carrying no information the markers lack.

Retirement wins on the same measurements. The drift the gate checks has not
occurred since the files went untracked on 2026-07-31. The drift it ignores has
occurred four times. A gate the table claims runs everywhere, and which runs on
one machine, teaches a contributor something false.

The two `.gitignore:51-52` entries stay. Both ledgers remain machine-local
files, with no gate reading them and no script regenerating them. A contributor
holding a copy may delete it. The ignore lines keep a stale copy out of a
commit, which is the one job they still have.

### Decision 2: One added requirement, not two

The delta adds one requirement, defining the marker convention. This change
considered a second one and dropped it. That candidate was a general rule: a
gate SHALL NOT exit 0 in silence when its input is absent. The rule already
stands twice in the same spec.

The whitespace requirement at `:174` says silence would read as a pass. The
prose requirement at `:217` demands a loud, named skip. A third statement of one
rule is a third place for the rule to drift.

The delta's requirement therefore carries the regenerator's properties as
rationale. It states no rule over the other gates. `scripts/gates/lockfile.sh`
prints a repair that needs the container and may need the network. That gate
stays. The property that set the regenerator apart was the `claude -p` call,
which no reader can reproduce.

### Decision 3: The refusal record is rewritten, not moved

The push gate blocks a verbatim move. The file `docs/decisions.md` measures
antislop exit 0, so its gate count is 0. Any error-class addition to it is a
rise.

The file's own line 1 carries an `allow-file` directive covering five rules,
`sentence-length` and `run-ons` among them. It stays: without it the file
measures 185 findings on a base of 0, which blocks every push. The rewrite
below still uses short sentences, because a directive nobody re-examines is
the wrong thing to trust. The two sibling changes rely on the same ruling.

The source block carries three error-class `sentence-length` findings, at
`PONYTAIL-AUDIT.md:393`, `:424` and `:433`. It also carries two
`allow-directive` comments, one for `paragraph-length` and one for
`sentence-length run-ons`. Both directives must go: a blanket carry-over into a
file at base 0 silences rules nobody re-examines.

The rewrite therefore restates every entry in short sentences. Decision 5 gives
the content in full, so the implementer never opens the gitignored source.

Note what does not apply here. The gate script `scripts/gates/prose.sh:23-24`
reads a renamed file's base count at its old path. That makes a `git mv` into
the archive free, even for a file carrying hundreds of findings. The two sibling
changes rely on that rule.

This change moves no file into the archive. It therefore pays the full price of
new prose in a file at base 0. The rename rule reaches it only at archive time,
when its own artifacts move under `openspec/changes/archive/`.

### Decision 4: What the compression keeps, and what it drops

The source block has two halves. The rule differs per half.

**Lines 206 to 438, "Checked, not flagged (deliberate)".** Every entry survives.
Each keeps three fields: the proposal, the refusal reason, and the measurement
or citation that refused it. This is the anti-re-litigation content, and it is
the reason the owner kept the record.

**Lines 145 to 205, "Checked 2026-08-16, not flagged".** Partial. An entry
survives when it names a candidate cut together with the fact that refutes it.
An entry drops when it is a bare inventory row, of the shape "this symbol has
callers". Those rows go stale with the tree, and a grep reproduces each one in
seconds. The refusal record exists to preserve reasoning a grep cannot rebuild.

Dropped by that rule: the two `ActorResolver` implementations,
`parseAllowedOrigins`, `corsHeaders`, `bearerTokenMatches`, `preload-db.ts`,
`dev-webhook-sink.ts`, the `system:*` role constants, the `permission_grants`
exports, `list-ops.ts`, `draft-array-crud.ts`, `DraftOf<T>`, the dock, panel and
canvas modules, `account-routes.ts`, the `i18n` directory, `static.ts`'s
`SECURITY_HEADERS` and `resolveContained`, `egressRefusal`,
`forEachLocalizedEntry`, `assignmentWarningLogic.ts`, `TemplatesScreen.tsx`, the
git hooks, the four area `routing.ts` and `errors.ts` files, the `ClientError`
union, `idempotency.ts`, `canonical-json.ts`, `strip-compiled.ts`, `health.ts`,
`metrics.ts` and `poll.ts`.

Two further blocks drop, from outside the range. The resolved-history index at
`:439-1021` goes, because 13 archived changes carry it. The snapshot delta
narratives go too, because their value expired at the next scan.

### Decision 5: The record's content, as it must land

The implementer writes the following into `docs/decisions.md`. It goes under a
new top-level heading, `## Refused simplifications (kept so the next sweep does
not re-propose them)`. Wording may change to clear the linter. The proposal, the
refusal reason and the measurement stay fixed.

Every path below was re-resolved against the tree with `git grep -n` on
2026-09-10. A line number survives only where no symbol identifies the site.
Gate script lines, test assertions and spec lines are the three cases.
Everywhere else the entry names the file and the symbol, so the citation
outlives a reflow. A dated
count, such as a line total measured on 2026-08-16, is history and stays as
measured. Task 3.3 in `tasks.md` repeats the resolution at apply time, because
the tree moves between review and apply.

**From the 2026-08-16 survey, kept:**

1. Five dependencies each earn their place. `@dagrejs/dagre` drives a layered
   layout with group-collapse. `@panzoom/panzoom` backs the canvas transform.
   The `lucide-react` import names 17 icons and tree-shakes. `jose` covers
   remote JWKS. Both `zod` and `@marcbachmann/cel-js` are load-bearing. `immer`
   already left the tree.
2. Extracting `packages/form-ui` further stayed refused. Its `react-dom` and
   `zod` peers are both real. The call `renderToStaticMarkup` runs in tests, and
   `resolveLocalizedText` pulls zod transitively. The package measured 535
   lines over eight files on 2026-08-16, with two consumers. That is still no
   shared-package proposal.
3. Hand-rolls that a platform feature would replace were checked and found
   absent. `crypto.randomUUID`, `Intl.NumberFormat` and `<dialog>` with
   `showModal()` already sit where a hand-roll would.
4. Collapsing `src/tenancy/` was refused. It is 360 lines over four files, and
   each of `connections.ts`'s four injected dependencies has a test passing
   something else. Its pool map carries the `ponytail:` marker naming the
   missing eviction.
5. Shortening the gate scripts was refused. Their length is comments recording
   measured traps.
6. Deleting an unused example was refused. On 2026-08-16 the directory held
   four `examples/*.json` files, referenced 176, 44, 25 and 23 times across
   docs, seed, specs and compose. It holds nine today.
7. Deleting unreferenced CSS classes was refused. On 2026-08-16 template
   literals built the `admin-badge-*`, `app-stamp-*` and `studio-diff-*`
   names. A selector grep therefore missed them on purpose. Those literals
   have since left the tree. The reasoning stays.
8. Replacing `packages/web/src/areas/studio/canvas/` with a graph library was
   refused. The directory stays hand-rolled SVG.
9. The route table in `src/http/server.ts` holds four `req.method ===`
   comparisons today. Finding 11 is the one open
   question over it, and it asks about a platform feature rather than
   duplication.

**From the deliberate block, all of it:**

10. **Finding 2, an all-or-nothing recipient rule over `nodemailer`.** Declined
    2026-08-18. Its only public send entry bundles the RCPT check with the
    message transfer. The library proceeds to `DATA` once it accepts any
    recipient. No configuration restores the rule the spec requires.
    [`src/handlers/notification-email.ts`; the requirement "Every recipient
    is accepted before the message is sent" in
    `openspec/specs/notification-email-action-handler/spec.md`]
11. **Finding 5, merge `RuleInput` into `ConditionInput`.** Rejected
    2026-08-16. A `git diff --no-index` run that day reported 51 insertions
    and 84 deletions over the two files, then 267 combined lines. The default
    operand and the field-against-field comparison have no counterpart on a
    path guard. [`packages/web/src/areas/studio/panels/shared/RuleInput.tsx`
    and `ConditionInput.tsx` beside it]
12. **Finding 28, drop `ConditionInput`'s `toggleVariant` prop.** Rejected
    2026-08-16. Each variant has a live caller. `panels/PathsPanel.tsx` passes
    `"disclosure"`, `panels/FieldCatalogPanel.tsx` passes `"link"`, and
    `panels/shared/BooleanOrExpressionInput.tsx` takes the `"link"` default.
    Dropping the prop changes what one of those sites renders.
    [`packages/web/src/areas/studio/panels/shared/ConditionInput.tsx`, the
    `toggleVariant` prop]
13. **Finding 22, `Intl.NumberFormat` for `formatDuration`.** Rejected
    2026-08-16. The test file
    `packages/web/test/reporting-reportingLogic.test.ts:90-110` pins 13
    strings across `en` and `de`, among them `"4.5 s"` and `"5,5 Std"`. The
    formatter renders `"4.5 sec"` and `"5,5 Std."` instead.
    [`packages/web/src/areas/reporting/screens/reportingLogic.ts`,
    `formatDuration`]
14. **`Intl.RelativeTimeFormat` for `waitingLabel`.** Rejected 2026-08-05, after
    surviving five scans as a finding. Four tests in
    `packages/web/test/inboxLogic.test.ts` pin `"5m"`, `"3h"`, `"2d"` and
    `"just now"`. Narrow style renders `"5 min. ago"`, and no style renders
    `"5m"`. Re-file it as a design change, never as a standard-library swap.
    [`packages/web/src/areas/app/screens/inboxLogic.ts`, `waitingLabel`]
15. **A shared changed-file collector for `prose.sh` and `whitespace.sh`.**
    Rejected 2026-08-05. Only `prose.sh` runs `git diff --name-status -M`, and
    it does so to read a renamed file's baseline at its old path.
    [`scripts/gates/prose.sh:74`, `scripts/gates/whitespace.sh:44`]
16. **Delete the unused registry seams.** Rejected. That set is
    `devHeaderResolver`, the action `Registry`, the `DataSourceRegistry`, the
    `AssignmentRegistry`'s multi-strategy handlers, `exampleRegistry.ts` with
    `RegistryPanel.tsx`, and `Action.execution`'s reserved enum. `CLAUDE.md`
    records the reserved enum and the dev-header seam as v1 boundaries, and
    the registries as the plugin seam. The two studio files have
    since left the tree, on 2026-08-18; the rest stand.
17. **Delete `Action.execution` specifically.** Rejected on a second ground. It
    sits inside `ProcessBody`, so removing it moves the `definitionHash` of
    every stored body carrying it. The field `definitionStatus` sits outside the
    body, so it does not.
18. **Replace the `migrateInstances` and `findOrphanKeys` keyset loop.**
    Declined 2026-07-26. [`src/engine/migration.ts`]
19. **Collapse `requireRole` and the role constants.** Rejected. The call sites
    ask about genuinely different roles.
20. **Reduce `checkAndRecordAttempt`'s parameters.** Rejected. Tests exercise
    each with different values. The signature read `(map, email, now)` when
    the cut was proposed; it has since grown a `maxAttempts` and a `capacity`
    parameter. [`src/auth/login.ts`, `checkAndRecordAttempt`]
21. **Collapse the two `ActorResolver` implementations.** Rejected. Both
    `jwt.ts` and `resolve.ts` are real implementations.
22. **Collapse the i18n catalogs into one.** Rejected. The JSON contract is
    multi-locale by construction, and the app area ships a real `de`. Finding 20
    cuts unused keys instead.
23. **Drop `optionText`'s `if (!attributes) return label` guard.** Rejected
    2026-08-16. The `attributes` parameter types as `Record<...> | undefined`,
    and `Object.values(undefined)` throws a `TypeError`. Only the guard's
    sibling was dead, the `parts.length === 0` branch, and that branch is cut.
    [`packages/form-ui/src/FieldForm.tsx`, `optionText`]
24. **Finding 39, merge `isGroup` and `isGroupField`.** Rejected 2026-08-16.
    Both bodies read `field.field.type === "group"`. The only module both call
    sites import at runtime is `types.ts`, which emits no JavaScript and
    reaches them through `import type`. Hosting the predicate there turns a
    type-only module into a runtime one, for three duplicated lines.
    [`packages/form-ui/src/FieldForm.tsx`, `isGroup`;
    `packages/form-ui/src/submit.ts`, `isGroupField`]
25. **Finding 9, delete `parseJsonb` as dead.** Rejected. A separate
    `parseJsonb` exports from `src/engine/host.ts`. `src/http/admin-routes.ts`
    names it on six lines, and `test/data-list-columns.test.ts` imports it. It
    returns `undefined` on a parse error, where the `drafts.ts` and
    `templates.ts` pair lets that error throw.
26. **Finding 9, merge `toTemplate` and `toDraft`.** Rejected. The two map
    different columns. One question stays filed and unresolved: does `Bun.sql`
    ever hand back raw text on the `drafts` and `templates` columns? A negative
    answer kills the string guard and ten further inline sites.
27. **Finding 26, a shared `requireAnyRole(actor, ...roles)`.** Rejected
    2026-08-16. The comment above `requireAuthoring` in
    `src/http/studio-routes.ts` rejects it and names one specific pair on
    purpose. `requireStudioRead`, in the same file, binds to the same rule by
    reference. The three helpers also raise three different messages, each
    naming its own role set. [`src/http/admin-routes.ts`,
    `requireDataListRead`]
28. **Finding 39, merge `requireNonBlank` and `requireString`.** Rejected
    2026-08-16. They differ three ways. `requireNonBlank` rejects
    `!value.trim()` and returns the untrimmed value, because trimming a password
    would store a secret the operator never typed. `requireString` rejects
    `raw.length === 0` and bounds the result at `MAX_KEY_LENGTH`. The messages
    differ too, `must not be empty` against `is required`. The input `"   "`
    passes `requireString` today and would fail a merged rule.
    [`src/http/admin-routes.ts`, `requireNonBlank` and `requireString`]
29. **Finding 54, inline `resolveBaseLocaleChange`.** Declined 2026-08-18. It
    exports on purpose: `studio-processHeaderLogic.test.ts` drives it as a pure
    function, and `ProcessHeaderBar` has no DOM test harness. The extraction is
    the only way to reach the base-locale sync regression it guards.
    [`packages/web/src/areas/studio/screens/processHeaderLogic.ts`]
30. **Finding 39, inline `resolveActor(req, resolver, db)`.** Rejected
    2026-08-16. Its body is one line, `resolver(req.headers, db)`. The command
    `git grep -o 'resolveActor(' -- src | wc -l` prints 22, the declaration
    among them. The archived change `2026-08-05-dedup-server-helpers` created
    the helper by collapsing four copies, and the doc comment above it says so.
    Inlining would reverse that change to save three lines.
    [`src/http/routes.ts`, `resolveActor`]
31. **Finding 39, inline `accountName.ts` into `Chrome.tsx`.** Rejected
    2026-08-16. The file is 15 lines with one call site, and it carries its own
    three-case test. Inlining moves the logic into a React component, so those
    three cases need a render to reach. The test then dies or grows a renderer.
    The change `2026-08-16-ponytail-cleanup-fetch-hooks-and-imports` declined
    finding 37 on this same ground. [`packages/web/src/shell/accountName.ts`]
32. **Finding 39, derive `onGoToArea` and `onGoToProfile` from the `go` prop.**
    Rejected 2026-08-16. Two derivations exist, not one. Each of the four area
    roots builds its own href as `/${a}`. The file `shell/App.tsx` passes
    `areaHref(a, "/")` at both of its `onGoToArea` sites, and `Chrome` serves
    both callers. [`packages/web/src/shell/App.tsx`]
33. **Finding 39, merge `listComments` and `listAttachments`.** Rejected
    2026-08-16. The two differ in path segment and in return type, a comment
    page against an attachment page. A merged function needs a type parameter
    and a segment argument, and would run longer than the pair it replaces.
    [`packages/web/src/areas/app/screens/TaskScreen.tsx`, the two `await`
    call sites]
34. **Finding 8, cut the 45-line comment above `armStepTimers`.** Rejected
    2026-08-16. The block states facts: totality, the CEL evaluation contract,
    and a magnitude bound from a real overflow analysis. None of it is process
    history, which is what the comment rule targets.
    [`src/engine/duration.ts`, the doc comment above `armStepTimers`]
35. **Finding 24, a generic `NamedError` base class.** Rejected 2026-08-16.
    Only `RequestShapeError` and `NotFoundError` are name-only.
    `InstanceNotRunningError` and `InstanceRunningError` each carry
    `instanceId` and `status` as readable state, and a caller distinguishes
    outcomes on it. A shared base would drop that state.
    [`src/errors.ts`, the four classes named]
36. **Finding 27, delete `BINARY_ROUTES`.** Rejected 2026-08-16. The
    requirement "`BINARY_ROUTES` declares every route that returns stored
    bytes" in `openspec/specs/http-wrapper/spec.md` names it. Its own comment
    says it stays unsynced on purpose. Deleting it deletes a spec requirement
    written after a measured `/admin/*` route collision.
    [`src/http/server.ts`, `BINARY_ROUTES`]
37. **Finding 29, cut four thin delegates in `src/cel/eval.ts`.** Rejected
    2026-08-16 for two of the four. The function `buildTransformContext`
    re-keys the context against the source catalog rather than delegating. The
    comment on `buildOutputContext` explains why its namespace stays separate
    from the guard context. The other two, `evalTransforms` and `evalFieldMap`,
    are genuine delegates and stay a finding.
    [`src/cel/eval.ts`, the four functions named]
38. **Finding 34, dedupe the two pagination helper sets.** Rejected 2026-08-16
    as a whole. The comments above `MAX_LIST_LIMIT` in `src/runtime/api.ts`
    and in `src/engine/admin-queries.ts` call the duplication deliberate: "the
    numbers agree today by coincidence, not by contract." Only `Page<T>` is an
    unexplained duplicate, and it stays a possible future finding.
39. **Finding 35, `Map.groupBy` for `groupMs`.** Rejected 2026-08-16. It would
    replace nine lines, and it needs `tsconfig.json`'s `lib` raised from
    `ES2022` to `ES2024` repo-wide. That blast radius is disproportionate.
    [`src/engine/reporting.ts`, `groupMs`]
40. **Finding 40, drop `JwtResolverConfig.localRolesClaim`.** Rejected
    2026-08-16. A call at `test/auth-jwt.test.ts:109` passes
    `localRolesClaim: "groups"`. The `?? "roles"` fallback inside
    `jwtResolver` is a default rather than dead code. [`src/auth/jwt.ts`,
    `JwtResolverConfig.localRolesClaim`]
41. **Finding 41, drop ten `src/` exports whose only importer is a test.**
    Rejected 2026-08-16. A test importer is an importer, and `export` is how the
    test reaches the symbol. The ten are `singleTenantSource`,
    `parseExpression`, `projectInstance`, `managerOfStarterStrategyDef`, the
    pair `InvalidTenantKey` and `TenantKeyTaken`, `checkDbReady`, `clientAddressOf`,
    `parseAuthIssuers`, `MAX_OVERRIDE_VALUE_LENGTH` and
    `countUiStringOverrides`. Two symbols with no importer at all,
    `checkTemplateKey` and `SUPPORTED_LOCALES`, lost their `export` instead.
42. **Finding 14, a copy-pasted `tFill`.** Rejected 2026-08-16. Only
    `areas/admin/catalog.ts` declares `tFill`, and only
    `areas/reporting/catalog.ts` declares `tCount`. The bodies differ: `tFill`
    walks `Object.entries(values)` with `replaceAll`, and `tCount` runs one
    `replace` on `{n}`. Each has one declaration, so neither is duplication.
43. **Finding 17, four area clients declare `listProcesses`.** Rejected
    2026-08-16 as a dedup. Three of the four agree exactly. The reporting
    area's version reads a different route, `/reporting/processes`, and unwraps
    `{processes}` from the body. It stayed its own function.
    [`packages/web/src/areas/reporting/api/client.ts`]
44. **Finding 17, `getInstanceRecord` is byte-identical.** Not a refusal: a
    correction, kept because the claim recurs. The two bodies differed by one
    local name, `query` against `params`, so "byte-identical" did not hold.
    The merge still landed, in the archived change
    `2026-08-17-ponytail-web-client-catalog-dedup`.
45. **Finding 17, route three types through the engine's exports map.**
    Rejected 2026-08-16. `HistoryEntry` reaches `packages/web` through the
    `./schema` entry. Of the three types named, `VersionSummary` lives in
    `src/engine/definitions.ts` and `InstanceRecordElement` in
    `src/runtime/api.ts`, files that map does not publish, and
    `InstanceRecordPage` has no engine declaration at all. Widening the engine
    package's public surface is an engine decision, and a `packages/web`
    refactor does not get to make it. The three moved to
    `packages/web/src/api/types.ts` instead.
46. **Finding 13, the `useFail(onUnauthorized, setError, describe)` signature.**
    Rejected 2026-08-16. That shape misses `shell/ProfilePage.tsx`, whose two
    sites answer with `setLoadFailed(true)` and `setSaveFailed(true)`. The
    shipped shape is `useFail(onUnauthorized, onError)`, taking the failure
    handler itself. Further sites, `TaskScreen.tsx` and `PlayerScreen.tsx`
    among them, kept their own ladder and share only the `is401` predicate.
    [`packages/web/src/shell/useFail.ts`]

### Decision 6: Finding 11 lands as an open decision, verified at the code

The entry goes under `docs/decisions.md`'s existing heading `## Decided, not yet
built (each needs its own OpenSpec change)`. This change verified every claim in
it against `src/http/server.ts` on 2026-09-10.

The `Route` type sits at `:229`, `seg` at `:302` and `match` at `:335`. The
OPTIONS branch at `:799` collects methods by filtering the same table.
`Bun.serve` takes `{ fetch, port, maxRequestBodySize }` at `:884`, and no
`routes` key. Two facts make the cut risky. `createServer` at `:522` returns the
`fetch` function itself, and the test suite drives that return value directly.
The per-request tenant resolve runs inside the dispatch path, at `:809-811`.

### Decision 7: The six citations point at the change that closed each finding

Each citation names a finding number the audit no longer holds. Each one gets
the archived change instead. That target survives a fresh clone.

| Citation site | Dead reference | New target |
|---|---|---|
| `openspec/specs/field-expression-map-consolidation/spec.md:16` | finding 1 | `2026-07-26-shared-field-expression-map-editor` |
| `openspec/specs/engine-poll-loop-consolidation/spec.md:16` | finding 2 | `2026-07-27-dedupe-engine-poll-loops` |
| `openspec/specs/auth-token-lifetime-consolidation/spec.md:15` | finding 7 | `2026-07-27-dedupe-auth-token-lifetime` |
| `openspec/specs/field-tree-check-consolidation/spec.md:11` | findings 65, 66 | `2026-08-18-field-tree-check-consolidation` |
| `src/pagination.ts:5` | finding 9 | `2026-07-29-correct-api-error-responses` |
| `docs/current-state.md:2657` | finding 9 | `2026-07-29-correct-api-error-responses` |

The four spec citations sit in Purpose prose as provenance. Every `SHALL` and
every `#### Scenario` in those files is self-contained, so no requirement
changes. Six further `*-consolidation` specs cite the audit nowhere. The
citation is therefore a footnote rather than a convention.

The `src/pagination.ts` target comes from `git log --diff-filter=A`. Commit
`4a5d1c9c`, dated 2026-07-29, added the file under
`Implement correct-api-error-responses`. The citation names the archived change
directory rather than that hash. A directory path survives the history rewrites
`CLAUDE.md` documents, and a hash does not. The directory exists at
`openspec/changes/archive/2026-07-29-correct-api-error-responses`.

### Decision 8: SEC-5 loses two citations it can no longer keep

`docs/decisions.md:1246-1258` is the SEC-5 bullet, on the login rate-limit
marker. It cites `PONYTAIL-DEBT.md:84-87` as a second record, and it cites
`scripts/gates/ponytail-ledger.sh:22` as the reason that record is unreliable.
This change deletes the script, so both citations go stale in the same commit.
The range was measured with `grep -n 'SEC-5\|SEC-6'` on 2026-09-10: SEC-5
opens at 1246 and SEC-6 at 1259.

The rewrite keeps the substance and drops three dead paths, not two. It names
the marker at `src/auth/login.ts:49`, and the two `Map` windows at `:54` and
`:61`. The risk sentence and the Postgres constraint stay as they are. The
deployment-runbook gap stays in substance, but the bullet's citation of
`docs/CODE_REVIEW.md:281` goes in the same rewrite. The second change in the
sequence moves that file into the OpenSpec archive, so a path kept here would
dangle one change later. The sentence names the review by date instead: "the
2026-08-18 code review asks for the single-process assumption in
`docs/runbooks/deployment.md`".

The bullet keeps its position between SEC-4 and SEC-6. Its heading stays
`## Open from the 2026-08-18 code review (each needs its own OpenSpec change)`.

### Decision 9: Position in the three-change sequence

This change lands first of three. Two later changes also append to
`docs/decisions.md`: the CODE_REVIEW change second, the field-model change
third.

What this change assumes about `docs/decisions.md` when it runs: the file is at
its `main` state, 1305 lines, with four top-level headings. Those are "Open
questions", "Decided and built", "Decided, not yet built", and "Open from the
2026-08-18 code review".

What this change leaves for the next two, in three parts. It appends a fifth
top-level heading at the end of the file. It adds one bullet inside "Decided,
not yet built". It rewrites the SEC-5 bullet. Every line number below `:970`
moves, so the two later changes anchor on text.

The new section appends at the end of the file. Folding the record into
"Decided and built" would widen the merge surface. The later changes write into
sections above the new one.

## Risks / Trade-offs

**A real check disappears.** Mitigated by measurement. The gate has run on one
machine since 2026-07-31, and the drift it detects has not occurred in that
window. The drift that did occur, four wrong line numbers, is drift the gate
ignores by design.

**The marker convention loses its only prose home in `CLAUDE.md`.** The table
row is where the convention is written down today. Deleting the row without a
replacement would leave 19 source comments following an undefined convention.
Mitigated by the added requirement, which is the replacement, and by one
sentence in `CLAUDE.md` pointing at it.

**A rewritten record loses fidelity.** Mitigated by Decision 4's rule and
Decision 5's content. Every entry keeps its proposal, its refusal reason and its
measurement. The reviewer can check any entry against this file without opening
the gitignored source.

**A new prose finding blocks the push.** `docs/decisions.md` and
`openspec/specs/push-gate-checks/spec.md` both sit at gate count 0, and the
record is the largest prose addition either has taken in one change. Mitigate it
by linting each file by exit code before the commit. Decision 3's ban on
carrying the source's two `allow-directive` comments across is the second
mitigation.

**The CI workflow breaks on the first push.** `.github/workflows/check.yml:51`
runs the deleted script by path. Mitigate it by deleting that step in the same
commit. A task then greps the whole tree for a surviving reference.

**Two sibling changes conflict in `docs/decisions.md`.** Mitigated by Decision
9. This change appends one section at the end of the file and edits two bullets
by text anchor.

## Migration Plan

Nothing persisted moves. No database row, no stored definition and no instance
reads either ledger or the gate. The migration is the order of three commits
against `docs/decisions.md`, and this change is the first.

1. This change lands. After it, `docs/decisions.md` carries five top-level
   headings, in this order.
   - "Open questions (still need a decision before building the relevant
     part)"
   - "Decided and built (kept for the reasoning, not for the work)"
   - "Decided, not yet built (each needs its own OpenSpec change)"
   - "Open from the 2026-08-18 code review (each needs its own OpenSpec
     change)"
   - "Refused simplifications (kept so the next sweep does not re-propose
     them)"

   The fifth runs to the end of the file. The finding-11 bullet sits inside
   the third. The rewritten SEC-5 bullet keeps its place in the fourth,
   between SEC-4 and SEC-6, and cites no `docs/CODE_REVIEW*` path.
2. The CODE_REVIEW change lands second. It moves `docs/CODE_REVIEW.md` and
   `docs/CODE_REVIEW-2026-07-29.md` into the archive and appends to
   `docs/decisions.md`. It anchors on heading text, since every line number
   from `:970` down has moved.
3. The field-model change lands third, under the same rule.

Rollback is `git revert` of one commit. The deleted scripts and the CI step
return with it. A revert leaves the workflow consistent.

## Open Questions

- Does `Bun.sql` ever hand back raw text on the `drafts` and `templates`
  `jsonb` columns? Decision 5, entry 26, records the question as filed and
  unresolved. A negative answer kills the string guard in `toTemplate` and
  `toDraft` and ten further inline sites. This change records the question and
  answers nothing.

## Rejected suggestions

- S4, a parenthetical at `openspec/specs/development-toolchain/spec.md:288`
  ("All six push gates reported green"). Rejected. The sentence narrates the
  2026-08-06 incident and stays true. This change edits no file outside its
  own directory and the files `proposal.md` names.
