# Design

## Context

See `proposal.md` for the motivation. Four read-only reviews checked the rule files against the tree at `52ec0d0a`. This design re-checked every fact it relies on against the same tree. Where a review was wrong, the plan below says so.

The rule files are prompt context. Nothing parses them, and no test reads them. Five live specs and about thirty comments in code and tests cite a rule file by name. Only the SHALL premise of `studio-checks-rail` rests on one. The spec `assignment-strategy-registry` names `process-contract.md` for the required `db` handle, and that stays true.

<!-- antislop: allow synonym-rotation -->
<!-- "edit rail" quotes the live spec's own retired word. -->
The spec `studio-canvas/spec.md:2078` cites UG for an "edit rail" that UG never carries. D4's entry records it.

`studio-step-page/spec.md:344` cites UG for *JSON surface*, and `instance-query-data-source/spec.md:149` cites PC for *display*. Both words stay. `studio-checks-rail/spec.md:493` relies on DL's mono rule, which stays too. The section "Inbound citations" below lists what the trims must keep.

Line numbers below refer to the tree at `52ec0d0a`. "PC", "AI", "DL" and "UG" stand for `process-contract.md`, `authoring-invariants.md`, `design-language.md` and `ui-glossary.md`.

## Goals / Non-Goals

**Goals:**

- Every sentence in the four rule files is true of the tree the change merges into.
- A rule file keeps what loads nowhere else. Text that copies `CLAUDE.md` or `DESIGN.md` becomes a pointer.
- Each `paths:` list loads the rule for the files it governs.
- The same stale claims go away from `CLAUDE.md`, `openspec/config.yaml`, `PRODUCT.md`, `README.md`, `DESIGN.md`, `docs/authoring-guide.md` and `docs/current-state.md`.
- The structural-check count and the check-order claims go away from the code comments that carry them.
- A comment or spec that quotes a rule file still finds the sentence it quotes.

**Non-Goals:**

- No behavior, schema, definition contract or UI change.
- No invariant gets built. D1 records the one unenforced rule as an open question.
- No sweep of retired words through live specs or the i18n catalog. D4 records them.
- No rewrite of `tmp/Detent Design Language.dc.html`. Git does not track it.
- No browser check. The change touches no screen. `docs/browser-checks.md` stays as it is, and D7 records its stale Values-tab lines.

## Decisions

### D1. The unenforced subprocess-child rule leaves the rule file

<!-- antislop: allow negation-habit -->
<!-- The quote reproduces the rule file's own words. -->
AI:66-67 says "a subprocess-callable child requires no fields outside its `inputFields`". No code enforces it. `inputFields` has three readers: `src/engine/definitions.ts:501-505`, `src/schema/compile.ts:466-468` and `:1139`. No live spec states it either.

The clause leaves AI. `docs/decisions.md` gets an Open-questions entry that names the rule. The entry says that building it is a definition contract change.

Tradeoff: an agent loses a reminder of an intended rule. It also stops trusting a check that does not exist.

### D2. Off-spec weights stay in code and become recorded drift

`DESIGN.md` gives the written face two weights, 800 and 400 (`:324`). It gives mono 600 on the stamp and the check badge (`:62`, `:343`, `:515`, `:530`). It states no weight for a machine value in running text (`:345-347`). DL states exactly that and no more.

Ten sites set another weight on the written face. Three set 500: `reporting/screens/BottleneckScreen.tsx:39`, `CycleTimeScreen.tsx:69` and `SlaScreen.tsx:40`. Four table headers set 600: `BottleneckScreen.tsx:35`, `CycleTimeScreen.tsx:65`, `SlaScreen.tsx:36` and `ReportTable.tsx:57`. Two picker labels set 600: `ProcessPickerScreen.tsx:54` and `ReportsListScreen.tsx:65`. So does `studio/screens/MigrationPlanScreen.tsx:108` (`surfaceToggleTabSelected`).

A new `docs/decisions.md` entry lists all ten beside the existing `#726e6e` entry.

Tradeoff: the ten sites stay off-spec until a UI change fixes them. The rule stops teaching a false weight set.

### D3. The Access tab gets a glossary row under that name

UG's per-tab table gains "Access tab", over `panels/AccessPanel.tsx`. The live spec says "Access surface" (`openspec/specs/studio-app/spec.md:4285`, `:4287`, `:4305`), and so does the catalog comment at `i18n/catalogs/studio.ts:964`. `docs/decisions.md` records that wording. This change leaves the spec as it is.

Tradeoff: spec and glossary disagree until a spec sweep. The glossary still names the tab with the word the other ten tabs use.

### D4. Retired words in live specs and the catalog become one decisions entry

<!-- antislop: allow synonym-rotation -->
<!-- The line lists retired UI words by name, and "issue" is the UI's own word. -->
The live specs still use *panels screen*, *ribbon*, *bench*, *steps register*, *configuration pane* and *inspector*. Examples: `studio-app/spec.md:631`, `studio-canvas/spec.md:1080`, `:2972` and `:3020`. `studio-canvas/spec.md:2078` names an *edit rail* and a `canvas/EditRail.tsx` that no longer exist. Two dead catalog keys, `ribbon.expand` and `ribbon.collapse`, sit at `i18n/catalogs/studio.ts:754-755`. One displayed string says "finding" where the rest of the UI says "issue" (`studio.ts:488`). One `docs/decisions.md` entry lists all of these.

Tradeoff: a MODIFIED heading cannot take a new word, and a spec sweep is its own change. The entry keeps the debt visible.

### D5. A pointer replaces a copy

A rule file that restates `CLAUDE.md` or `DESIGN.md` keeps one line naming the source. It keeps content that loads nowhere else. The event catalogue points at `src/schema/definition.ts` (`instanceEvent`) and the `runtime-events` spec. It keeps the four invariants no single kind comment states.

Tradeoff: an agent opens a second file for a detail. The hand list drifted from 15 kinds to 12, so the copy costs more than the lookup.

### D6. Targeted antislop directives replace the file-wide ones

PC:14 and AI:12 each carry an `allow-file` directive. Both go. The implementer fixes the prose. Where a line cannot change, a targeted `<!-- antislop: allow <rule> -->` sits beside it with one sentence of reason. DL and UG have no directive today.

Tradeoff: the prose gate re-scores both files, so the rewrite takes longer. The ratchet then sees each finding, which is what `CLAUDE.md` asks for.

### D7. FIELDS-13 narrows to what stays open

UG loses the "field tabs" row, which closes most of FIELDS-13 (`docs/decisions.md:1105-1111`). `docs/browser-checks.md:1881-1889` and `:2369` still test a Values tab. The implementer rewords the entry to name only those lines, since a browser run must rewrite them.

Tradeoff: the entry stays open. Deleting it would hide a stale checklist.

### D8. The glossary binds words people read

UG states that its rules bind UI text, docs, specs, commit messages and conversation. A code identifier stays out of scope. Examples: `styles.tabRow` in `packages/form-ui/src/FieldForm.tsx:399`, `EdgeStyle` in `studio/screens/EditScreen.tsx:41`, and the key `stepsRail.dragHandle`.

Tradeoff: code keeps a few retired words. A rename sweep through code would touch UI modules, and this change keeps them untouched.

### D9. The spec delta drops the structural-check count

`studio-checks-rail` says "six structural checks" at `:52` and `:101`. `compileProcessBody` runs twelve (`src/schema/compile.ts:1218-1233`). The delta drops the number, so a thirteenth check cannot make it stale. It also replaces the premise at `:49`. That premise cited AI for a Zod-first order that AI never stated and the code does not follow.

`compileProcessBody` runs durations first, then the structural checks, then its own Zod parse. `validateStructure` reports the duration and structural dimensions as not run when Zod fails and the compile pass raised nothing (`src/validate.ts:131-134`). A Zod-invalid draft that raised a structural issue reports `structural` as run. The rail then shows that group's issues (`checksRail.ts::heldBackFor`).

The delta rewords five sentences to clear antislop findings the copied block carried. No SHALL changes meaning. The first scenario narrows to the case the code implements. One new scenario covers the Zod-invalid draft that raised a structural issue.

### D10. Frontmatter globs

| File | Add | Why |
|---|---|---|
| PC | `src/validate.ts`, `packages/form-ui/**` | PC names `validate.ts` and the renderer's contract behavior (`FieldForm.tsx`, `PathButtons.tsx`) |
| AI | `src/validate.ts` | the shared validation entry for publish and the studio |
| DL | `DESIGN.md` | `DESIGN.md` holds the values DL's rules point at |
| UG | `openspec/**`, `docs/browser-checks.md`, `DESIGN.md` | retired words persist in specs and docs |

AI does not take `test/**`. That glob would load 200 lines whenever a test file changes, for one sentence about rejecting tests. `CLAUDE.md` already carries that sentence.

## Per-file plan

Every entry states the verified fact the new text must carry.

### process-contract.md

Wrong or stale:

1. PC:221-228, the `core.` exemption. Replace it. No action type is exempt from registry resolution, `core.` included (`src/engine/registry-check.ts:130`). The two internal handlers register with their own `configSchema` (`src/engine/subprocess.ts:315-319`). The compile pass rejects a `core.` type on both branches (`compile.ts::checkReservedActionPrefix`).

   Delete the assignment-strategy contrast sentence.
2. PC:272-313, the event catalogue. Replace with a pointer to `definition.ts`'s `instanceEvent` union (15 kinds today) and the `runtime-events` spec. Keep four invariants.

   - An event never advances `transitionSeq`, and events order by `at`.
   - Only `timer.fired` and `subprocess.spawn-enqueued` enqueue actions and carry `ActionOutcome`s.
   - `instance.faulted` commits with its status flip in one transaction, under one OCC predicate.
   - A new kind adds to the union and leaves the record shape alone.
3. PC:268, the causes. The list is `user`, `timer`, `automatic`, `migration`, `cancel` (`definition.ts:1262`).
4. PC:181-185, the binding. The schema requires `versionBinding`, `latest-at-spawn` or `pinned`, with no default (`definition.ts:841`). The studio editor preselects `pinned` (`SubprocessSpecEditor.tsx:45`). Keep the `contractRef` sentence.
5. PC:187, the plugin list. Actions, data sources and assignment strategies resolve through a registry. A field `type` may be a `{ type, config }` envelope that no registry resolves (`definition.ts:344`). Guards are CEL only.
6. PC:43. Replace with "Nothing deletes a published version." No code path deletes a `definitions` row.
7. PC:213. `validateReferences` runs the three registry checks and the single-body CEL check. `publishBody` throws their results in a fixed order (`definitions.ts:688-704`). The order is action registry, assignment registry, data source registry, then CEL. `DataSourceRegistryValidationError` also carries `checkInstanceQueryValueFromField` issues.
8. PC:103-105, the `control` readers. Drop "three studio files". Name the form renderer, `definition.ts::fieldKindOf` and "several studio files".
9. PC:102-103, the `format` readers. Say "read beyond the publish check". Name `typeMatches`, `celType`, `src/runtime/fields.ts` (person options) and the `org.actor-from-field` check in `compile.ts`.
10. PC:188-189. `configSchema` is a Zod schema (`registry.ts:68`). The studio descriptor converts it to JSON Schema (`src/engine/config-descriptor.ts`).
11. PC:63 and PC:217-235. Delete process-history wording ("now agrees", "still exported", "no longer calls it directly").

Gaps to add, one or two sentences each:

1. Cancellation: `cancellable` on the body and the step (`definition.ts:920`, `:989`). The engine synthesizes a cancel path. `onCancel` actions run as its onPath actions. The engine skips the step's `onExit`. `authoredProcessBody` reserves the cancel-sink id, key and outcome. Spec: `cancellation`.
2. `collaboration`: `comments` and `attachments` on the body and the step. A step's entry wins over the process's, which wins over `true` (`definition.ts:821-830`).
3. One general hash rule: a new optional `ProcessBody` key uses `.optional()`, never `.default()`. `canonicalize()` drops an undefined key, so an older body keeps its `definitionHash`. The rule does not reach a record outside `ProcessBody`, such as the instance `kind` at `definition.ts:1542`. It replaces the per-feature restatements at PC:124-126 and PC:132-133.
4. The runtime depth cap: a spawn refuses a child once the parent's depth reaches 16 (`MAX_SUBPROCESS_DEPTH`, `src/engine/subprocess.ts:56`, `:109`). It backs up `validateSubprocessCycle`.
5. `columnMapping` mismatch: the engine drops the value, the submission still succeeds, and `datasource.attribute-dropped` records it (`definition.ts:1479-1490`).
6. `ActionOutcome.suppressed`: the engine withholds the whole writeback when the instance was not running or had migrated (`definition.ts:1241-1248`).
7. `ViewNote`: a note carries `kind: "note"`, and a field entry has no `kind` (`definition.ts:727-755`).
8. Migration `transforms` scope: `data` from the source catalog and `instance` only. The environment withholds `result`, `child`, data sources and `actor` (`src/cel/check.ts:456-462`).

Trims:

1. PC:17-21, and the first sentences of Identity, Hashing, Expressions, Actions and Paths. These copy `CLAUDE.md`'s "The definition contract in brief". Keep one pointer line.
2. PC:163-165, the all-manual or all-automatic rule and the priority-uniqueness rule. Point at AI for them. Keep the evaluation semantics in PC:
   - lower `priority` evaluates first, and the first matching guard wins
   - a wait-state has no default, so no match means wait, bounded by a timer
   - a gated side effect is a visible wait-state with result-driven automatic paths
3. PC:23-36, the UUIDv7 history. Two sentences stay: runtime ids are UUIDv4 from `crypto.randomUUID()`, and the id schemas enforce only the prefix. The subprocess examples use readable ids for that reason.
4. PC:187-235, Extensibility. Cut it to about ten lines, with seven facts:
   - three registries
   - a required per-tenant `db`
   - the publish-time type and config check at five action positions
   - placement after the hash-hit return
   - one thrown class per registry
   - a handler with no `configSchema` accepts any `config`
   - a field binds a data source by id, never inline, and options resolve at runtime
5. The event catalogue, per item 2 above. Keep the section label "Runtime record (the audit backbone)".
6. PC:14, the directive, per D6.

Side fix: `src/schema/definition.ts:439` says the studio's "two pickers" read `ALLOWED_BY_TYPE`. No file under `packages/` imports it. Drop that clause.

### authoring-invariants.md

Wrong or stale:

1. AI:50-51. A non-terminal step needs at least one outgoing path. A timer is no alternative exit, since its `targetPath` must be one of the step's own paths (`definition.ts:942-945`, `:1096-1099`).
2. AI:55. A field declares at most one of `options` and `dataSource`, and a field with neither passes (`definition.ts:356-359`). Timer `duration` XOR `deadline` stays.
3. AI:66-67. Drop the second clause, per D1.
4. AI:44. Keep the site list and drop "sole cross-entity". The new text: "`id` anchors every stored reference. CEL reads a field `key` as `data.<key>`. A view entry's `group` names a group field's `key`, and its `tab` names a key in the same view's `tabs`."
5. AI:89-91 and AI:95, "the CEL step below". Name `src/cel/check.ts::validateProcessBody`, reached through `src/validate.ts::validateReferences`.
6. AI:85-88, the `LocalizedText` list. Name the process, step and field labels and descriptions, nested group fields, option labels, view tab labels and `ViewNote.text`. Placement: `processBody`'s superRefine, which both `authoredProcessBody` and `publishedProcessBody` inherit (`definition.ts:1004-1093`).
7. AI:161-163, the key length bound. Only `FieldDef.key` and a `columnMapping` column key carry one (`compile.ts:681-683`, `:573-575`).
8. AI:168-176, the writer list. An action `output` on the entry's own step counts only from its `onEntry`. The own step's `onExit`, `onPath` and `onCancel` outputs fire after the submission gate and do not count. An own-step timer's `onFire` output counts only when that timer declares a `targetPath` (`compile.ts:1046-1117`).
9. AI:64-65. Say "every declared outcome is bound by some terminal step" (`definition.ts:1115-1119`). The code runs no graph reachability.

Gaps to add:

1. Two actions on one transition never write the same output field. One set is `onExit`, `onPath` and the target's `onEntry`. The other is `onCancel` (`definition.ts:1026-1036`, `:1081`, `:1085`).
2. A timer's `targetPath` names an outgoing path of its own step (`definition.ts:1096-1099`).
3. `now()`, `timestamp()` and `duration()` fail at every checked CEL site with "time function not allowed" (`src/cel/check.ts:161`, `:315`).
4. A timer `deadline` must infer to `string` (`check.ts:260-269`).
5. A pointer line to PC's Expressions section for CEL scopes.
6. A pointer line to PC for the seven DB-resolving checks, plus the `valueFromField` rule. A `valueFromField` must resolve to a scalar field (`checkInstanceQueryValueFromField`, `definitions.ts:224-240`).
7. `viewTab.key` is non-empty after trimming (`definition.ts:683`).
8. A short paragraph on where the checks run, in publish order:
   - `validateStructure`: durations, the twelve structural checks, Zod
   - the hash-hit return
   - `validateReferences`: the registry checks and CEL
   - the seven DB-resolving checks in `publishBody`
9. Migration plan checks run at plan registration (`src/engine/migration.ts:85-107`, `MigrationPlanError`), with the transform CEL check. Neither runs at publish.

Trims:

1. AI:33-35 repeats AI:25-27. Keep one.
2. AI:37-42, the `walkFieldsIndexed` layout. Keep one sentence: `checkFieldTree` is one of twelve structural checks and runs five per-field checks.
3. The placement pointer appears about twelve times. State the rule once, then tag each bullet "(schema)" or "(compile)".
4. AI:197-198, the `purchase-requisition.json` history. Drop it.
5. Meaning that PC already states. That covers validationMode, `technical`, `redactable`, `format`, `control`, `Path.key`, `Path.label`, columnMapping and the group clause. AI keeps the enforcement facts: site, message and placement. PC keeps the meaning. AI keeps the sentence "An empty `group` reads as no group."
6. AI:12, the directive, per D6.

### design-language.md

Wrong or stale:

1. DL:9-11, the source. `DESIGN.md` is the token and value authority. `tmp/Detent Design Language.dc.html` is an untracked visual reference that may lag. Its stamp swatch still shows `#ec3013`, which `tokens.css:26` replaced with `#d42b11`.
2. DL:32. `Unclaimed` and `Booked` are no color roles. Name real ones: `--color-accent`, `--color-text-muted`, `--color-dormant`.
3. DL:49-53. State the weights per D2, in these words: "The written face takes two weights, 800 and 400. Mono takes 600 on a stamp and on the check badge. A machine value in running text takes the size around it. `docs/decisions.md` lists ten off-spec sites, and none is precedent."
4. DL:36-38 and DL:209-211. Keep the rule. Add one line: known violations exist, `docs/decisions.md` tracks them, and none is precedent. The sites: five `#726e6e` stamps, `form-ui/src/FieldForm.tsx:204-205` (`colors.refusal700`, `colors.paper50`) and `studio/canvas/CanvasView.tsx:303`, `:313` (`colors.neutral900`).
5. DL:103-106, the stamp lookups. Cite `app/screens/InvolvedScreen.tsx` and `StartedScreen.tsx` (`stampTone`) and `admin/screens/InstancesScreen.tsx` (`badgeTone`). Admin names its style `badge`.
6. DL:183-186, the `select` chevron. Scope it to the studio select in `studio/panels/PathsPanel.tsx`, per `studio-canvas/spec.md:2984-2990`. Apply the same scope to `DESIGN.md:590-592`.
7. DL:250-251. `formatDuration` prints one unit with at most one decimal, for example `3.2 d` (`reporting/screens/reportingLogic.ts:92-104`).
8. DL:216-218. Drop "208". Say "over 200 call sites".
9. DL:203-207. Scope the sentence to compiled component styles. The `.btn` family and `global.css` keep DOM-state selectors.
10. DL:228-230. `global.css` holds `.shell` and `.shell > *`. The `web-styling` spec counts four literal survivors.
11. `DESIGN.md:794`. Say "outside the `tokens.css` family, the shell frame and the three `web-styling` exceptions".

Gaps to add, one or two sentences each:

1. Elevation, in these words: "`shadow-md` sits on the account menu (`Chrome.tsx`) and `shadow-lg` on a dialog, in the top layer only. On the page, `box-shadow` draws inset lines only. They are the selection mark, the steps rail's drop-position line and the field matrix's flagged-cell ring. None lifts a box." The sites: `StepsRail.tsx:142`, `:147` and `FieldMatrixGrid.tsx:179`.
2. Accent on Muted: `--color-accent-on-muted` for accent text or marks on the ledger ground or a hover wash.
3. Motion: no component declares a transition. The field catalog's usage tint is the one animation. A new one is a design change.
4. Never Green: success prints in ink.
<!-- antislop: allow synonym-rotation -->
<!-- "Remove" is the displayed label of the controls this line names. -->
5. Authoring command scope: add the change list's commands, the form editor's move controls and a placed field's remove control. A group card's `Remove ({count})` stays exempt (`web-styling` spec).
6. Layout caps: `--layout-cap-narrow` (61rem) and `--layout-cap-wide` (80rem).
7. Focus tokens: `--focus-ring-width`, `--focus-ring-offset`, `--focus-ring-reach`. The scroll-box rule binds the studio area (`spa-accessibility`).
8. The check badge prints only above zero.

Trims, each to a one-line rule plus a pointer at `DESIGN.md`:

1. DL:123-128, focus.
2. DL:130-135, the authoring command.
3. DL:153-162, the grip. Drop "in the chevrons' old position", and the same phrase in `StepsRail.tsx:113`.
4. DL:54-57, the mono stack. Name `--font-mono` and `fonts.mono`.
5. DL:51-53, the Archivo deferral. Point at `docs/decisions.md`.
6. DL:63-77, rule weights and selection marks. The kept line: "Two rule weights exist, 2px and 1px. Nothing sits between them, and neither softens into a tint."
7. DL:164-192, callout, measuring rule, fields and states. Keep the `DurationRule` pointer and the sibling error list. Keep three sentences word for word: "An empty state says so in words. It never shows as an empty table. A waiting state shows one line where the content will appear, with no skeleton and no spinner."
8. DL:15-16 and DL:83. Replace generic "surface" with "box" and "the operator's screens".

### ui-glossary.md

Wrong or stale:

1. UG:87 and UG:122-125. Delete the "field tabs" row and paragraph. The field editor stacks zones (`panels/FieldCatalogPanel.tsx:558`).
2. UG:170-176. A rail is a column that holds a register list or a validation list and scrolls on its own. The steps rail and the entity rail sit beside the main content. The checks rail fills the Checks tab (`screens/EditScreen.tsx:1015-1025`).
3. UG:143-146. The wrapper adds the toolbar and the legend. It turns on the grid's bulk badges through `showBulkBadges`. The grid draws them (`FieldMatrixGrid.tsx:485`, `:505`).
4. UG:58. `structureActive` is a prop of `panels/ProcessHeaderBar.tsx` (`:630`).
5. UG:95. The form card lives in `panels/FormsTab.tsx` (`FormCard`, `:373`). Its row data lives in `panels/formCardRows.ts`.
6. UG:84. The Developer view also sits under a field, the form editor and a condition or rule input. Add `panels/FieldCatalogPanel.tsx`, `screens/FormEditorScreen.tsx`, `panels/shared/ConditionInput.tsx` and `panels/shared/RuleInput.tsx`.
7. UG:127-130 and UG:198. Add the D8 scope sentence.
8. UG:229 and UG:9-10. `PRODUCT.md` defines the audiences and carries the no-synonym rule for operator and surface. Name it beside `CLAUDE.md`.

Gaps to add:

1. The Access tab row, per D3.
2. "Developer" names three things: the studio audience, a per-process access role and the Developer view. `PRODUCT.md` calls the audience "process author". Fix the use of each.
3. *grip* for the steps rail's drag control.
4. The header bar row gains the content-locale badge. The `⋮` menu gains the add-locale control. *Content locale* names authored text. *Language* names the account menu's UI locale.
5. The `⋮` menu has two groups: "Process, saved with the draft" (Cancellable, assignment groups) and "Views". The Collaboration checkboxes sit inside the `⋮` menu's first group (`panels/ProcessHeaderBar.tsx:881`, `:959`).
6. Rows for *form editor* and *form canvas*. Bare *canvas* names only the graph.
7. *issue* is the word for one validation item.
8. Rows for the studio screens outside the process surface: process list (`ProcessesScreen.tsx`), Versions, migration plan, Tools, Templates. Rows for Task screen (`app/screens/TaskScreen.tsx`) and instance detail (`admin/screens/InstanceScreen.tsx`).
9. *draft toolbar* joins the retired words. Its controls moved into the header bar.
10. The profile page belongs to no area (`shell/ProfilePage.tsx`).

Trims:

1. UG:19-24. Keep only "chrome names the one header every area shares".
2. UG:13-15, the audience paragraph.
3. UG:184-187. It repeats UG:70-72 and UG:98.
4. UG:39-43. DL states the area switch. Keep a pointer.
5. UG:127-130. Keep only the `FieldForm` sentence.
6. UG:181-182. Say that `*Panel` components serve as section bodies and as whole tab bodies.

Keep *JSON surface* as a glossary term, since `studio-step-page/spec.md:344` cites it.

### Repeated claims elsewhere

<!-- antislop: allow synonym-rotation -->
<!-- "display text" quotes the definition contract's own term for `label`. -->
The `key` wording for `CLAUDE.md` and `openspec/config.yaml` reads: "The opaque `id` anchors every stored reference and all persisted instance state. A `key` is a slug with two readers. CEL reads a field as `data.<key>`. A view entry's `group` names a group field's `key`, and its `tab` names a key in the same view's `tabs`. A `label` is display text."

| File | Fix |
|---|---|
| `CLAUDE.md:67-68` | the `key` wording above |
| `CLAUDE.md:289` | drop "with its selection-driven inspector" |
| `CLAUDE.md:111` | "drafts list" becomes "process list", the spec's word |
| `CLAUDE.md:21`, `:27`; `PRODUCT.md:14`, `:51` | "JSON view" becomes "JSON surface". The capability id `studio-json-view` keeps its name |
| `CLAUDE.md:62-65` | add `src/validate.ts` to the list of paths that load the rules |
| `CLAUDE.md:396-401` | the design-authority wording below |
| `PRODUCT.md:98-101` | the design-authority wording below |
| `README.md:23` | "JSON view" becomes "JSON surface" |
| `openspec/config.yaml:25-26` | the `key` wording above |
| `openspec/config.yaml:13` | "JSON view" becomes "JSON surface" |
| `openspec/config.yaml:57-58` | "ten tabs" becomes eleven, adding access |
| `docs/authoring-guide.md:319` | "The raw JSON view" becomes "The raw JSON surface" |
| `docs/authoring-guide.md:364` | "A field `key` is a mutable slug." |
| `docs/authoring-guide.md:1126` | "an outcome no end step binds" |
| `docs/current-state.md:252` | the canvas wording below |
| `src/validate.ts:7`, `:64`, `:108` | "nine" becomes "twelve" |
| `src/engine/definitions.ts:619` | "nine" becomes "twelve" |
| `src/schema/compile.ts:1213` | "the remaining four" becomes "the remaining seven" |
| `packages/web/src/areas/studio/draft/validation.ts:64-65` | "duration, the twelve structural checks and the Zod gate, in that order" |
| `packages/web/src/areas/studio/draft/checksRail.ts:4-7` | the display-order wording below |
| `packages/web/src/areas/studio/draft/checksRail.ts:33-35` | the held-back wording below |
| `packages/web/src/areas/studio/draft/checksRail.ts:38` | "six" becomes "twelve" |

The design-authority wording: "The token and value authority is `DESIGN.md`. The prose rules live in `.claude/rules/design-language.md`, which loads for `packages/web/**`, `packages/form-ui/**` and `DESIGN.md`. The file `tmp/Detent Design Language.dc.html` is an untracked visual reference that may lag the other two."

The canvas wording for `docs/current-state.md:252`: "A click on a step selects it on the canvas. Enter on a focused step opens it on the Steps tab's step page."

The display-order wording for `checksRail.ts:4-7`: "Group display order, which is no run order. Zod comes first, since every other group holds back without it. The four engine groups follow, and view comes last as the studio's own findings. The run order differs: `compileProcessBody` runs durations before the structural checks. Likewise, `validateReferences` runs registry before CEL."

The held-back wording for `checksRail.ts:33-35`: "A duration failure stops `compileProcessBody` before the structural checks. A Zod-invalid draft whose compile pass raised nothing reports `structural` as `not-run` (`src/validate.ts:134`)."

The count grep, `git grep -nE '(six|seven|nine) structural|remaining four' -- src packages/*/src`, finds nothing after the fix. It skips the test directories on purpose.

`docs/authoring-guide.md:475` already says "at least one exit" with no timer clause. It stays. `packages/web/test/studio-draftValidationLogic.test.ts:7` narrates the six checks one earlier change added, so it stays too.

### Inbound citations

After the trims, run `git grep -nE 'process-contract\.md|authoring-invariants|design-language\.md|ui-glossary\.md' -- src packages docs openspec/specs`. For each quoted sentence or named section, confirm the rule file still carries it. Otherwise re-point the comment at `DESIGN.md`. The trims above keep these on purpose:

- PC's section label "Runtime record (the audit backbone)", cited by `docs/openapi.yaml:1736` and `docs/decisions.md:26`
- AI's "An empty `group` reads as no group", quoted by `packages/web/test/studio-view-tree.test.ts:117`
- DL's two rule weights and "nothing between them", cited by `packages/web/src/areas/studio/panels/StepPage.tsx:141`
- DL's empty-state sentences, quoted by `i18n/catalogs/studio.ts:504` and `packages/web/test/studio-fieldMatrixEmptyAndGated.test.tsx:12`
- DL's waiting-state rule, cited by `app/screens/TaskScreen.tsx:173` and `reporting/components.tsx:158`

One citation is stale today. `studio/screens/FormEditorScreen.tsx:476` cites DL for the Title role, which DL does not state. Re-point it at `DESIGN.md`'s Hierarchy section.

### docs/decisions.md

1. Open questions: the subprocess-child rule, per D1.
2. Decided, not yet built: the ten off-spec weight sites, per D2, beside the `#726e6e` entry.
3. Decided, not yet built: "Access surface" in the spec and the catalog comment, per D3.
4. Decided, not yet built: retired words in live specs and the catalog, per D4. The entry names `studio-canvas/spec.md:2078` too.
5. FIELDS-13 reworded, per D7.
6. The Archivo entry at `:264-279`. "nothing between" stays true of the rule. Add one sentence that names the ten off-spec sites and points at the D2 entry. Drop the `app.css` sentence, since no tracked `app.css` exists.

## Risks / Trade-offs

- [A trim drops a fact that loads nowhere else] → Each trim names its target file. The implementer checks the fact exists there before deleting.
- [A trim breaks an inbound citation] → The "Inbound citations" sweep runs after the trims and names what must stay.
- [New prose trips the prose gate] → D6 rewrites both files. The implementer runs the gate over the range before the push.
- [A line number drifts before apply] → Each entry names a symbol or a quoted phrase beside the line number.
- [Rule files go stale again] → Pointers replace hand lists where the code already holds the list (D5, D9).
- [UG now loads whenever a spec file changes] → The trims shrink UG first. Its words matter most where specs repeat them.

## Migration Plan

None. The change touches documentation and comments only. A revert restores the old text.

## Open Questions

None.
