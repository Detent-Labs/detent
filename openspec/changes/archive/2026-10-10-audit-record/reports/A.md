# Area A: Definition contract

The audit checked HEAD `5f41cd8a` and only read. It read these files in full:
`src/schema/compile.ts`, `src/schema/canonical-json.ts`, `src/schema/hash.ts`,
`src/schema/strip-compiled.ts`, `src/schema/step-graph.ts`, `src/validate.ts`,
`src/cel/check.ts`, `src/cel/eval.ts`, `src/schema/definition.ts:1-1222`. It
also read these targeted ranges: `src/engine/definitions.ts:540-720`,
`src/engine/transition.ts:280-310,640-770`, `src/engine/duration.ts:140-185`,
`src/runtime/fields.ts:95-115,215-260,455-480,540-595`,
`src/engine/seeded-create.ts:1-80`, `src/handlers/process-start.ts:1-60`,
`src/http/routes.ts:630-665`,
`node_modules/@marcbachmann/cel-js/lib/{options,macros,functions}.js` (version
8.0.0).

## Findings

### A-1: CEL in a `process.start` action's `config.inputMapping` bypasses every publish check

- Case:
  - An author puts an action into the `onEntry` of a step.
  - The action is `{ type: "process.start", config: { processId: "proc_b", inputMapping: { field_x: { lang: "cel", src: "data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))" } } } }`.
  - The route `POST /processes` (`handlePublish`, `src/http/routes.ts:638-656`)
    calls `publishBody`. The check `validateReferences` checks only the type
    and the config schema of the action. The config schema
    `processStartConfigSchema` (`src/handlers/process-start.ts:36-39`)
    requires only the shape `{lang:"cel", src:string}`.
  - The check `validateProcessChaining` (`src/engine/definitions.ts:563-582`)
    checks only the keys, through `checkProcessChainingTarget`
    (`src/cel/check.ts:414-433`). Its own comment at `check.ts:402-405` says
    it "parses no CEL and type-checks no expression".
  - Publish accepts the version. On every delivery, the function
    `createSeededInstance` (`src/engine/seeded-create.ts:49`) evaluates the
    expression with `evalFieldMap`. It applies no structural bound, and it
    runs on the event loop of the outbox worker.
  - Three nested comprehensions over a list of 1,000 entries take 10^9 steps.
- Mechanism: the function `check.ts::collect` (`src/cel/check.ts:225-295`)
  collects expressions only from the named body positions. It never reads
  `Plugin.config`. The same holds for `compile.ts::collectExpressionSites`
  (`src/schema/compile.ts:741-783`), which holds the length bound
  `MAX_EXPRESSION_LENGTH`. So the parse and type check do not reach this site.
  The time function ban (`check.ts:161`) and the SEC-7 bounds do not reach it
  either. Those bounds are 2,000 nodes, depth 64 and two comprehensions
  (`check.ts:104-105,179-211`). The length bound of 4,000 characters also
  stays out.
- Location: `src/cel/check.ts:225-295`, `src/cel/check.ts:414-433`,
  `src/schema/compile.ts:741-783`, `src/engine/definitions.ts:563-582`,
  `src/handlers/process-start.ts:36-39`, `src/engine/seeded-create.ts:49`
- Severity: medium (needs the publish right. Effect: silent entry loss at
  runtime, and unbounded CPU time in the worker for a malicious or faulty
  expression)
- Evidence: confirmed by reading the named lines. The runtime effect
  (blocking) stays an assumption. See the repro below.
- Counter-evidence sought: the studio check
  `packages/web/src/areas/studio/draft/validation.ts:136` filters
  `process.start` sites only to load the target. A `git grep` for
  `checkCelExpressions|validateProcessBody(|checkSite` finds no call on config
  values. The cel-js default bounds (`options.js:4-8`: 100,000 nodes, depth
  250) bound the parse only. They leave the evaluation unbounded. The search
  found no protection.
- Known: partly. The entry `docs/decisions.md:1192` (FIELDS-17) names the
  missing CEL check of the value, with the consequence
  `mapping.entry-dropped`. New: this site also lacks the SEC-7 structural
  bound (`docs/decisions-archive.md:859`, "Every checked CEL site"). It lacks
  the length bound too.
- Suggestion: in `validateReferences`, check the `inputMapping` values of
  every `process.start` site with `checkSite`. Use the guard environment of
  the body itself (`result:false, child:false, actor:true`). Add the same sites
  to `collectExpressionSites`. Add the rule to `authoring-invariants.md`
  (OpenSpec change).

### A-2: The idempotent compile branch accepts an author-written cancel sink of any shape

- Case:
  - An author with the publish right sends a contracted child body to
    `POST /processes`. The body itself holds a step:
    `{ id: "step_cancel_sink", key: "x", type: "task", terminal: true, outcome: "approved" }`.
    Its `contract.outcomes` is `["approved"]`, without `"cancelled"`.
  - The call `publishedProcessBody.safeParse(body)` in `compileProcessBody`
    succeeds (`src/schema/compile.ts:1251-1252`). The schema
    `publishedProcessBody` checks only the number of sinks
    (`src/schema/definition.ts:1154-1162`). The schema `authoredProcessBody`
    reserves id, key and outcome (`definition.ts:1137-1147`). It does not run
    on this branch.
  - A later cancel of a child instance makes `cancelInstance` enter exactly
    this step (`src/engine/transition.ts:704-708`). It queues the return with
    `childOutcome: target.outcome` (`transition.ts:296-300`). The parent
    process receives `child.outcome == "approved"` for a cancel and follows
    the approval path.
  - Variant: a sink that is not terminal needs a path. Then the engine queues
    no return (`transition.ts:296`), and the parent step waits forever.
  - Variant: the `onEntry` actions on the sink run on every cancel
    (`transition.ts:707`).
- Location: `src/schema/compile.ts:1248-1252`,
  `src/schema/definition.ts:1154-1162`, `src/engine/transition.ts:296-300,704-708`
- Severity: medium (unusual precondition: a hand-written body that is already
  compiled. Effect: a wrong outcome reaches foreign parent instances, or a
  parent stays parked for good)
- Evidence: confirmed by reading. The test `test/cancel.test.ts:136-153`
  builds exactly such a "lookalike" sink. Its assertion
  `expect(publishedProcessBody.safeParse(b).success).toBe(true)` (`:152`)
  shows that the branch accepts it. The test checks only the `core.` ban. The
  audit did not run it end to end. See the repro below.
- Counter-evidence sought: the check `structuralIssues`
  (`compile.ts:1218-1233`) has no check of the sink shape. Neither
  `validateReferences` nor the seven DB checks in `publishBody`
  (`definitions.ts:678-720`) inspect the sink. The `processBody` superRefine
  (`definition.ts:993-1121`) accepts an outcome other than "cancelled" on the
  terminal sink. The review disposition on SEC-3
  (`openspec/changes/archive/2026-08-18-code-review-record/CODE_REVIEW-2026-07-29.md:586-590`)
  fixes only the `core.` prefix and leaves the sink shape open on purpose. The
  search found no protection.
- Known: new (SEC-3 concerned only the `core.` prefix on the same branch).
- Suggestion: on the idempotent branch, check that the body equals the
  canonical compile of its own round trip:
  `canonicalize(compileProcessBody(stripCompiledContent(parsed))) === canonicalize(parsed)`.
  That enforces the id, key, shape, position and outcome of the sink in one
  step (OpenSpec change, new invariant in `authoring-invariants.md`).

### A-3: CEL `matches()` runs an author regex at runtime, with no publish check

- Case:
  - An author writes `data.kommentar.matches("^(a+)+$")` as a path guard, or
    as the `visible` flag of a form field.
  - The call `env.check` accepts it (signature `string.matches(string): bool`).
    The list `FORBIDDEN_FUNCS` (`src/cel/check.ts:161`) lacks `matches`. The
    file `compile.ts` collects no regex from CEL.
  - At runtime cel-js calls `new RegExp(b).test(a)` on every evaluation, with
    no cache (`node_modules/@marcbachmann/cel-js/lib/functions.js:356-362`).
  - Two consequences follow:
    - (a) A literal that does not compile, such as `data.x.matches("(")`,
      throws on every evaluation. The function `evalGuard` turns that into
      `false` (`src/cel/eval.ts:163-170`). The path never matches, and the
      instance waits with no message.
    - (b) A backtracking pattern runs against a string from a participant,
      with no length limit. The function `resolveFields` evaluates `visible`
      on every form fetch (`src/runtime/fields.ts:229,245-255`).
- Location: `src/cel/check.ts:161,310-336`, `src/cel/eval.ts:163-170`, cel-js
  `functions.js:356-362`
- Severity: medium (needs a pattern from the author. Case (a) is a realistic
  typo, and case (b) hits the shared event loop)
- Evidence: confirmed by reading for the code path. Assumed: `env.check`
  accepts the invalid literal, and the runtime blocks. See the repro below.
- Counter-evidence sought: a `git grep "matches"` in `docs`, `openspec/specs`,
  `.claude/rules`, `src/cel` and `test/cel.test.ts` finds no hit. The SEC-4
  hardening (`src/runtime/fields.ts:461-466`) runs a pattern only after a
  passed length check. It covers `validation.pattern` only, and CEL stays
  outside it.
- Known: new. Related: SEC-4 (`CODE_REVIEW-2026-07-29.md:143`) for
  `validation.pattern`, and SEC-7 (`docs/decisions-archive.md:859`) for
  comprehension cost.
- Suggestion: in `checkSite`, allow a `matches` call only with a string
  literal as the pattern. Compile the literal with `new RegExp` and bind it to
  `MAX_PATTERN_LENGTH`. Reject a pattern that is not a literal. Add the rule
  to `authoring-invariants.md` (OpenSpec change).

### A-4: Guards, view flags and `validation.rule` may return a type other than `bool`

- Case:
  - An author writes `data.status` as an automatic guard, instead of
    `data.status == "ok"`. The field `status` has `type: "string"`.
  - The function `checkSite` checks only parse and type. An expected result
    type applies only at the deadline (`src/cel/check.ts:269,327`). Publish
    accepts the body.
  - At runtime `evaluate` returns a string. The function `evalGuard` compares
    `=== true` (`src/cel/eval.ts:166`) and returns `false`. The path never
    fires, and every instance parks silently.
  - The same holds for `validation.rule` (`src/runtime/fields.ts:552,583`).
    An expression that is not `bool` rejects every submission with
    `rule-failed`.
- Location: `src/cel/check.ts:256-283,310-336`, `src/cel/eval.ts:163-170`
- Severity: medium (a realistic typo in the raw CEL input, with a silent
  effect)
- Evidence: confirmed by reading. The spec sets this down:
  `openspec/specs/cel-expressions/spec.md:381-385` ("only the deadline site
  declares an expected result type"). The comment in `publishBody`
  (`src/engine/definitions.ts:592-595`) gives exactly this damage as the
  reason for the publish check. It reads: "a broken guard is total, so it
  evaluates false forever and parks the instance".
- Counter-evidence sought: no other checker expects `bool` (`git grep` for
  `expect.*bool` in `src/cel`, `openspec/specs`). The condition builder
  produces comparisons. The raw input in the Developer view does not.
- Known: new (the spec sets it as intent and does not name the damage).
- Suggestion: set `expect: "bool"` at the guard sites, the
  `visible`/`required`/`readonly` sites and the `validation.rule` sites. The
  deadline already sets `"string"` the same way, and `dyn` stays allowed.
  Spec change (OpenSpec change).

### A-5: View flags of a subprocess step check against `child` but run without `child`

- Case:
  - A subprocess step holds a field in its `view` with
    `visible: { src: "child.outcome == 'ok'" }`.
  - On subprocess steps, `collect` registers `child` for `visible`,
    `required` and `readonly` (`src/cel/check.ts:273-276`). Publish accepts
    the body.
  - At runtime only `resolveFields` evaluates these flags. It uses
    `buildGuardContext(body, instance, actor)`, which has no `child`
    (`src/runtime/fields.ts:229,245-255`).
  - The name `child` is unbound, so `evalGuard` returns `false`. The field
    stays hidden every time.
- Location: `src/cel/check.ts:273-276`, `src/runtime/fields.ts:229,245-255`
- Severity: low (a subprocess step has no manual path. The finding touches
  only the display)
- Evidence: confirmed by reading. A `git grep` for `resolveFlag(` and for
  contexts with `child` in `src` shows only `subprocess.ts:228,263`
  (outputMapping and path choice).
- Counter-evidence sought: `src` has no second evaluator for view flags. The
  package `packages/form-ui` evaluates no CEL (`git grep evaluate(` finds no
  hit there).
- Known: new. The spec claims the opposite:
  `openspec/specs/cel-expressions/spec.md:187-190` ("Those three flags
  resolve while a child instance can exist").
- Suggestion: in `collect`, give the three flags `child: false`, as
  `validation.rule` already has (`check.ts:281`). Correct the spec sentence
  (OpenSpec change).

### A-6: Seven invariants without a rejecting test

- Case: the file `CLAUDE.md` requires a test for each invariant that rejects
  a violating input. For these rules the search found none:
  1. A terminal step has no outgoing paths (`src/schema/definition.ts:940`).
  2. A timer `targetPath` must be one of the step's own paths
     (`definition.ts:1096-1099`).
  3. Timer `duration` XOR `deadline` (`definition.ts:649-652`).
  4. The key `pinnedVersion` appears exactly for `pinned`, and `contractRef`
     for `latest-at-spawn` (`definition.ts:847-854`).
  5. A contracted terminal step needs an outcome (`definition.ts:1110`).
     Some terminal step binds every declared outcome
     (`definition.ts:1116-1119`).
  6. Length bounds for `Plugin.type`, duration, `FieldDef.key` and
     `columnMapping` keys
     (`src/schema/compile.ts:825-829,837-841,681-683,573-575`). Tests cover
     only the expression bounds (`test/compile-validation.test.ts:438-484`).
  7. The key `unmappableStep` appears exactly for `route-to-step`
     (`definition.ts:1180-1183`). Also duplicate step ids
     (`definition.ts:1041`), and the reserved sink `key` alone
     (`definition.ts:1142`). The test `test/cancel.test.ts:102` changes the
     id and leaves the key.
- Location: see the list
- Severity: low (the refinements exist in the code. The tests that guard them
  are missing)
- Evidence: confirmed by search. A `git grep` over `test` and
  `packages/web/test` searched for test titles and for these message texts:
  `has no outgoing paths`, `timer targetPath is not`, `exactly one of duration`,
  `pinnedVersion is present iff`, `contractRef is required`, `needs an outcome`,
  `has no terminal step`, `type exceeds the`, `duration exceeds the`,
  `key exceeds the`, `unmappableStep is present iff`, `duplicate step ids`.
  The only hits sit in studio tests with their own logic
  (`packages/web/test/studio-canvas-dropGesture.test.ts:48`). The others
  concern other rules (`test/http-ui-strings.test.ts:157`).
- Counter-evidence sought: the audit read the test titles in
  `test/validate.test.ts`, `test/compile-validation.test.ts`,
  `test/cancel.test.ts`, `test/cross-process.test.ts`,
  `test/migration.test.ts`, `test/timer.test.ts` and `test/cel.test.ts`. See
  the table below.
- Known: new
- Suggestion: add one `safeParse` or `compileProcessBody` test per line, in
  `test/validate.test.ts` or `test/compile-validation.test.ts`.

### A-7: `canonical-json.ts` misdescribes its number handling, and its `ponytail:` has reached its bound and is moot

- Case:
  - The comment says that a `ProcessBody` holds only integers
    (`src/schema/canonical-json.ts:3-5`). The `ponytail:` defers full RFC 8785
    number canonicalization to the day a non-integer enters (`:14-15`).
  - That day is long past. The keys `fieldValidation.min/max`
    (`definition.ts:270-271`), a literal `default` (`definition.ts:177`) and
    `Path.priority` (`definition.ts:667`) are `z.number()`. One example is
    `min: 0.05`.
  - The code has reached the bound, yet no work follows. RFC 8785 section 3.2.2.3
    defines the number form as that of ECMAScript. That is exactly
    `JSON.stringify` (`canonical-json.ts:18`), including `-0` to `0`.
  - The key sort with `.sort()` (`:21`) compares UTF-16 code units, as
    RFC 8785 section 3.2.3 requires.
- Location: `src/schema/canonical-json.ts:2-5,14-15`
- Severity: low (doc drift. The hash is correct)
- Evidence: confirmed by reading
- Counter-evidence sought: the storage path `jsonb`
  (`src/engine/store.ts:80,219,234`) returns numbers without loss. The
  function `canonicalize` sorts independently of the jsonb key order.
- Known: new
- Suggestion: change the comment to "numbers through ECMAScript
  serialization, which RFC 8785 itself prescribes". Delete the `ponytail:`.

### A-8: `Action.execution` and `Action.idempotencyKey` get published but never read

- Case:
  - An author sets `execution: "blocking"` and expects the transition to wait
    for the result. Or the author sets an own `idempotencyKey`.
  - Both keys stand in the schema (`src/schema/definition.ts:623,625`). They
    enter the hash and pass every publish check.
  - A `git grep` finds no reader of `.execution` in `src`. The outbox rows
    always get the derived key
    `idempotencyKey(instanceId, nextSeq, a.id)` (`src/engine/transition.ts:261`).
  - The action runs async with the default key, and the author never learns
    it.
- Location: `src/schema/definition.ts:200,623,625`,
  `src/engine/transition.ts:261`
- Severity: low (`CLAUDE.md` calls `blocking` "reserved but not built". The
  silent acceptance is still a trap)
- Evidence: confirmed by `git grep -E "\.execution\b|\"blocking\""` (only
  `definition.ts:200`) and by `git grep "action\.idempotencyKey|a\.idempotencyKey"`
  (no hit).
- Counter-evidence sought: the outbox (`src/engine/outbox.ts:29-36`) reads
  only `retry`.
- Known: new
- Suggestion: reject `execution: "blocking"` at publish. Either read
  `idempotencyKey` or remove it from the schema (OpenSpec change, definition
  contract).

### A-9: Doc drift in the area

- Case and location:
  - The comment at `src/schema/definition.ts:163-165` says: "Guards read
    data / instance / actor / named data sources". No site can read data
    sources (`src/cel/check.ts:114-119`, `process-contract.md:62-64`).
  - The comment at `src/schema/definition.ts:181-183` says that plugins
    resolve at publish through a registry "{ config schema, output schema }".
    No registry keeps an output schema. A `git grep -i outputSchema` in `src`
    finds no hit outside comments.
  - The `ponytail:` at `src/cel/check.ts:52-53` reads "dyn for ... data
    sources until ... the registry lands". The registries exist
    (`src/engine/registry.ts`). Instead of registering data sources as `dyn`,
    the engine does not register them at all. The bound "registry lands" is
    reached, and the statement on data sources is wrong.
  - The entry `docs/decisions.md:799` lists the count error in the
    `structuralIssues` comment as open. On HEAD the comment correctly reads
    "the remaining seven" (`src/schema/compile.ts:1209-1216`). The fix has
    landed, so the entry should go.
- Severity: low
- Evidence: confirmed by reading
- Known: `docs/decisions.md:799` (known, now stale). The rest is new.
- Suggestion: correct the comments. Narrow the `ponytail:` in `check.ts:52`
  to the plugin field types. Delete the entry `docs/decisions.md:799`.

## Checked without a finding

- Does the hash cover only `ProcessBody`? Yes. The function `publishBody`
  hashes `structure.compiled` (`src/engine/definitions.ts:635-637`). That is
  the parse output of `compileProcessBody`
  (`src/schema/compile.ts:1252,1258,1278-1282`). The wrapper `processVersion`
  (`definition.ts:1190-1198`) stays out of the hash. All other callers
  (`store.ts:1196,1342`, `resolution.ts:100`, `migration.ts:396,532`,
  `runtime/instances.ts:142,162,328`) hash parsed bodies.
- JCS conformance: keys sort by UTF-16 code units (`canonical-json.ts:21`).
  The function `JSON.stringify` serializes strings and numbers (`:18,22`), as
  RFC 8785 prescribes. Values that are `undefined` drop out (`:21`), and `-0` becomes
  `0`. No body array can hold `undefined`, since the Zod schemas have no
  `undefined` element. The only drift is in the docs, see A-7.
- Derived fields in the hash: the sink and the reserved outcome enter on
  purpose (`compile.ts:8-10,1262-1282`). The function `stripCompiledContent`
  reverses that (`strip-compiled.ts:17-28`). The body has no `.default()`. A
  `grep` in `definition.ts` finds only `:1542`, outside the body. The call
  `z.string().trim()` on `Path.key/label` and `viewTab.key`
  (`definition.ts:661-662,683`) is idempotent, so the re-parse on read keeps
  the hash.
- Indirect `now()`: cel-js 8.0.0 has no `now` (a `grep` in `lib/*.js` finds no
  hit). The checker bans `timestamp()` and `duration()` at every site that
  `collect` covers, and in transforms (`check.ts:161-177,312-315,474-480`).
  No field has a time CEL type (`celType`, `check.ts:55-67`). The only macros
  are `has`, `all`, `exists`, `exists_one`, `map`, `filter` and `cel.bind`
  (`macros.js:125-219`). None of them is non-deterministic. The one gap sits
  at the unchecked site from A-1.
- Guard totality: a catch wraps every evaluation. This covers `evalGuard`
  (`eval.ts:163-170`), `evalMapTotal` (`eval.ts:119-141`) and the deadline
  (`engine/duration.ts:162-168`). View flags and rules use `evalGuard`
  (`runtime/fields.ts:108-112,552,583`). The function `evalOutput` throws on
  purpose (`eval.ts:225-235`, spec `process-contract.md:84-87`). SEC-7: the
  runtime has no clock-based bound, per the owner ruling
  (`docs/decisions-archive.md:859-881`). This audit does not propose it again.
- Path rules: the check `checkPathTriggerConsistency`
  (`definition.ts:884-908`) runs in the `step` superRefine (`:952`). An
  automatic path does not need a priority, which matches the rule. Equal priorities:
  `:898`. A default below the highest priority: `:901-905`. The runtime sorts
  in ascending order (`transition.ts:764-769`), which fits. No gap.
- Plugins at publish: the check `validateReferences`
  (`src/validate.ts:196-241`) resolves actions at five positions, assignment
  strategies and data sources.
  It checks the config when `publishBody` passes the registries
  (`definitions.ts:678-683`). Two gaps stay open on purpose, and the
  docs name them. One is field plugin types without a registry
  (`process-contract.md:250-252`). The other is a hash hit without a new check
  (`definitions.ts:639-657`). Runtime surprises: A-1 (CEL in config) and A-8.
- Invariants that have a rejecting test:
  - Id resolution: path target `test/validate.test.ts:31`, view ref `:544`,
    data source `:489,:509`, output target `:678`, `initialStep`
    `test/draft-test-instances.test.ts:254`.
  - Unique keys `test/validate.test.ts:452`. Data source keys `:466`.
    Reserved namespace `:478`. Duplicate field, path, action, timer and data
    source ids `:426,:440,:358,:373,:391,:414`.
  - A step that is not terminal needs a path `test/validate.test.ts:185`.
  - Disjoint outputs `test/validate.test.ts:105`, onCancel `:121`.
  - Trigger and priority `test/validate.test.ts:52,64,307,313,319,328,337`.
  - The key `options` XOR `dataSource` `test/validate.test.ts:78`.
  - Duration grammar and bound `test/validate.test.ts:723-755`.
  - A subprocess needs a contract `test/cross-process.test.ts:146`. Outcome
    in the contract `test/validate.test.ts:72`. Outcome only on a terminal
    step `:46`.
  - Keys of `inputMapping` in the child contract
    `test/cross-process.test.ts:128`.
  - Subprocess spec and wait state `test/validate.test.ts:173,177,181`.
  - Cycle `test/cross-process.test.ts:251,257,264`.
  - The key `valueFromField` `test/instance-query-cross-process.test.ts:284,299,314`.
  - Migration maps `test/migration.test.ts:320`. Injective `fieldMap`
    `test/validate.test.ts:903`. Transform CEL
    `test/cel.test.ts:454,460,470,481,485,490,498,691`.
  - The key `baseLocale` `test/localized-text.test.ts:23,28`, tab label
    `test/view-tabs.test.ts:143`.
  - CEL type check `test/cel.test.ts:52,194`, `test/definitions.test.ts:183`.
  - CEL structural bound `test/cel.test.ts:642,674,682`.
  - Time functions `test/cel.test.ts:343`. Deadline `string` `:243`.
  - The `core.` prefix `test/subprocess.test.ts:555`, `test/cancel.test.ts:136`.
  - Unknown keys `test/compile-validation.test.ts:60,78,108`.
  - Pattern `test/compile-validation.test.ts:309,318,332,341`.
  - The key `validationMode` and an empty `validation`
    `test/validate.test.ts:622,626`.
  - The key `outputMapping` and the contract lists
    `test/compile-validation.test.ts:395,423,428`.
  - The key `technical` `test/compile-validation.test.ts:660,693`.
    The key `redactable` `:741`.
  - Field key grammar `test/compile-validation.test.ts:356`.
  - The keys `format`/`control`/`default`
    `test/field-format-control.test.ts:338,343,348,353,358,379,403`.
  - The keys `Path.key`/`label` `test/validate.test.ts:229-249`.
  - The key `columnMapping` `test/compile-validation.test.ts:581-615`.
  - Expression lengths `test/compile-validation.test.ts:439,452,459,466,475`.
  - Required plus readonly `test/compile-validation.test.ts:805` and the
    tests after it.
  - View group `test/compile-validation.test.ts:1256-1469`.
  - Tabs `test/view-tabs.test.ts:80,88,96,104,115,128`.
  - The strategy `org.group-members` `test/compile-validation.test.ts:1144`.
    The strategy `org.actor-from-field` `:1188,:1196`.
  - Reserved sink id `test/cancel.test.ts:102`, reserved outcome
    `:108,:116`.
  - Missing: see A-6.
- Performance: a graph query searched `src/schema`, `src/cel` and
  `src/validate.ts`. It looked for loop depth and for linear search inside
  loops. It returns only `computeDominatorSets` (loop depth 3),
  `disjointOutputs`, `forbiddenTimeCall`, `comprehensionTooDeep` and
  `checkProcessChainingTarget`. The function `computeDominatorSets` is
  `O(E·S)` per pass (`step-graph.ts:71-92`). The check
  `checkUnsatisfiableRequiredReadonly` calls `computeWriterSet` per manual
  step (`compile.ts:1183-1185`), so it is `O(S·(S·V+F))`.
  - At realistic sizes (under 200 steps) this causes no noticeable slowdown.
    The audit did not measure it.
- The `ponytail:` sites: `check.ts:34` has its bound not yet reached. No
  example and no spec reads more `instance` or `actor` fields in CEL (a
  `git grep` in `examples`). For `check.ts:52` and `canonical-json.ts:14`,
  see A-9 and A-7.
- Known points: the fix for the entry `docs/decisions.md:799` has landed
  (A-9). The entry
  `:1133` FIELDS-11 still stands (`compile.ts:722-724` uses the flat index).
  The entry `:373` still holds (`check.ts:114-119`, `buildEnv` registers no
  data source).

## Repro proposals

Run all of them in the devcontainer, as `bun -e` from the repo root.

1. A-1, publish accepts unchecked CEL:
   <!-- antislop: allow sentence-length -->
   <!-- verbatim repro code: the linter does not mask a fence indented in a list item -->
   ```
   import { validateStructure, validateReferences } from "./src/validate.ts";
   import ex from "./examples/expense-approval.json";
   const b = structuredClone(ex.definition);
   b.workflow.steps[0].onEntry = [{ id: "action_ps", type: "process.start", config: { processId: "proc_x", inputMapping: { field_y: { lang: "cel", src: "timestamp('2026-01-01T00:00:00Z') == timestamp('2026-01-01T00:00:00Z') && [1].all(a, [1].all(b, [1].all(c, true)))" } } } }];
   const s = validateStructure(b);
   const r = validateReferences(s.compiled, { registryDescription: { actionTypes: ["process.start"], assignmentStrategyTypes: [], dataSourceTypes: [] }, loadedChildren: {}, targetsByLoc: {} });
   console.log(s.issues.length, r.celIssues.length);
   ```
   Expected for a confirmed finding: `0 0`. The same source on a path guard
   yields `time function not allowed`.
2. A-2, a compiled body with a foreign sink:
   - Take the body from `test/cancel.test.ts:137-146`. Set
     `outcome: "approved"` on the sink. Leave `"cancelled"` out of
     `contract.outcomes`, and insert no `core.` action. The call
     `compileProcessBody(b)` must return without an error.
   - End to end: publish this body as a child. Start a parent with a
     `child.outcome == "approved"` guard. Cancel the child instance with
     `cancelInstance`. Expected for a confirmed finding: the parent follows
     the approval path.
3. A-3:
   <!-- antislop: allow sentence-length -->
   <!-- verbatim repro code: the linter does not mask a fence indented in a list item -->
   ```
   import { checkAgainstFields } from "./src/cel/check.ts";
   import { evaluate } from "@marcbachmann/cel-js";
   const f = [{ id: "field_s", key: "s", label: { en: "S" }, type: "string" }];
   console.log(checkAgainstFields('data.s.matches("(")', f));
   const t = Date.now(); try { evaluate('data.s.matches("^(a+)+$")', { data: { s: "a".repeat(28) + "!" } }); } catch {} console.log(Date.now() - t, "ms");
   ```
   Expected for a confirmed finding: `{ ok: true }` and a runtime in the range
   of seconds.
4. A-4: the call `checkAgainstFields("data.s", f)`, with `f` from 3, yields
   `{ ok: true }`. The call
   `evalGuard({lang:"cel",src:"data.s"}, {data:{s:"x"}})` yields `false`.
5. A-5: take a body whose subprocess step holds a view field with
   `visible: { lang: "cel", src: "child.outcome == 'ok'" }`. The call
   `validateProcessBody` on it returns no message. The call `evalGuard` with
   `buildGuardContext(...)` yields `false`.

## Not checked

- The audit sampled `src/schema/definition.ts:1222-1544` (instance, history
  and event schemas) only. That range lies outside the audit questions of
  this area.
- The audit read `src/engine/registry-check.ts` and the seven DB checks in
  `src/engine/definitions.ts` only as far as the plugin question required
  (Engine area).
- No execution. The audit did not measure the runtime effect of A-1 and A-3,
  or the end-to-end effect of A-2. The repro steps above cover them.
- The performance statements rest on no measurement.
