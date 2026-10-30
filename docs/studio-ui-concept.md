# Studio UI concept

Status: decided on 2026-10-30. This record states no requirement. A later
change writes each rule into its capability spec when it builds the decision.
Stage 64 in `ROADMAP.md` carries the seven principles and the ordered change
list. This record carries the reasoning behind them. A change that renames an
entry in the list updates both files.

When stage 64 closes, its last change moves this file into the archive of
change 1, `studio-fresh-draft-starts-clean`.

## 1. Inventory: the studio on 2026-10-30

### Screens outside the process surface

| Screen | Route | Purpose | Leads to |
|---|---|---|---|
| Process list | `/studio` | One row per process: draft state, published version, hash. The control `+ New process` opens the start picker dialog (empty or template). The control `Import a promoted version` opens a preview dialog. Per row: `Create draft` or `Open`, `Discard draft` (native confirm), `Versions`. | process surface, Versions |
| Versions | `/processes/:id/versions` | published versions, change list of draft vs base, `Plan migration` | migration plan screen |
| Migration plan | `/processes/:id/migrate/:from/:to` | Mapping/JSON toggle, orphan-key dry run | back to Versions |
| Tools | `/tools` | registry listing, CEL scratchpad; developer role only | none |
| Templates | `/templates` | list, create from a published version, `Delete` (confirm) | none |
| Player | `/processes/:id/play` | instance access fieldset; form pane + record pane; `Create test instance` runs the saved draft | none named back to the draft |

### The process surface

The process surface lives at `/processes/:id/edit/:tab`. Top to bottom it
holds the screen nav (`Back to processes`), the header bar and the restore
notice. The tab row and one tab body follow.

The header bar holds the name (inline rename), the key and the revision. It
also holds the dirty or saved state and the content-locale badge. Then come
the Comment and Attachments checkboxes, Save, `Discard draft`, Publish and
the `⋮` menu.

The `⋮` menu holds two groups. The group "Process, saved with the draft"
holds the key, the base language and Cancellable. It also holds the link to
manage assignment groups. The group "Views" holds the JSON surface, Versions
and the Player.

The tab row holds eleven tabs, and all eleven bodies stay mounted at once.

| Tab | Body | Count |
|---|---|---|
| Canvas | canvas bar (split add button, reachability, selection controls) + SVG canvas (toolbar overlay: Fit to view, Rounded corners, Arrange) | none |
| Steps | Steps rail: numbered rows, badge, grip, three add controls. Step page: a masthead and two columns of open sections. The first column holds Path to, Assignment, Cancellable, Which process it calls and How the case ends. The second column holds On entry, On exit, Time limit, Step form fields and Collaboration. The foot holds Previous, Next and Developer view. | steps |
| Fields | Entity rail plus field catalog. The definition half holds What kind, What it asks, Where values come from, Default value and Validation. The effect half holds Used in, Only ask this when and Ask for this. | fields |
| Data sources | entity rail + plugin envelope editor | sources |
| Paths | one table row per path: source, trigger, priority, guard (CEL source), target | paths |
| Forms | one card per step with a view, legend, open control | steps with a view |
| Field matrix | fields x steps grid of visible/required/readonly flags, toolbar, legend | view findings |
| Contract | inputs, outputs, outcomes | none |
| Changes | change list vs base version, Developer view per row | rows |
| Checks | checks rail grouped by source (ZOD, STRUCTURAL, CEL, REGISTRY, DURATION, VIEW) | open check results |
| Access | Developer, Owner, Reader lists | none |

### The form editor

The form editor is a routed sub-state at `/edit/form/:stepId`. It holds the
palette, the form canvas, a strip for the selected entry and the form
preview. The palette lists the catalog fields that the form does not hold
yet. Its control "Add a field to the process" mints a field by kind: Text,
Choice, Date, File or Section.

The form canvas carries the form tab strip and a columns toggle. The strip
for the selected entry sets visible, required and readonly as a three-way
choice. CEL for the three stands behind the Developer view. The strip also
sets the span and the tab. The form preview stays inert. The control
`← Back to the process` returns to the process surface.

### Ways between the parts

1. Enter on a canvas node opens the Steps tab. A click on a path opens the
   source step's Path to section.
2. A steps rail row selects its step on the canvas.
3. The step page's `Build the form` and a Forms card open the form editor.
   Its back control returns.
4. A Checks row or a Changes row opens the owning tab: Steps, Fields or
   Paths.
5. The Views group of the `⋮` menu opens the JSON surface in place of the
   tab body. It also opens Versions and the Player.
6. The link to manage assignment groups opens the admin area, with no way
   back.
7. The field catalog's `Show on the canvas` opens the Canvas tab with the
   step selected.

### Where raw JSON or CEL shows without a Developer view

- The Paths tab's guard column prints CEL source.
- The field matrix prints a CEL stamp with its source.
- Each Changes row prints CEL as source.
- A property with no plain word prints under its JSON key.
- Field keys and data-source keys print in mono everywhere.
- The header bar prints the key and the hash.
- The Timer deadline input takes CEL.
- The action output mapping takes CEL over `result`.
- The plugin envelope prints a "Settings (JSON)" text area for an
  unregistered type.
- The JSON surface prints the whole definition.

### Open studio points in docs/decisions.md

These entries stood open on 2026-10-30.

- Six `confirm()` prompts remain: leave draft, Arrange, process-list
  discard, template discard and two in the field catalog. Two of them
  hardcode English.
- Outside the chrome of the process surface, 22 failure renders have no
  alert role.
- Three confirmation dialogs share presentation gaps. The heading has the
  wrong role, Cancel takes the accent, and counts print outside mono. The
  dialogs have no gutter at 420px and no `aria-describedby`.
- The native `<dialog>` traps the keyboard badly. Tab from Cancel lands on
  the body. StartPicker and PromotionPreview drop focus on close.
- DRAFT-1: the header bar's `Discard draft` does nothing (High).
- RAIL-2: the grip measures 26px. RAIL-5: the badge shows severity by
  colour alone. RAIL-6: the desktop rail is narrower than the phone rail.
  RAIL-7: three scroll boxes nest below 64rem.
- On the canvas, a removal drops focus. The caret menu ignores the arrow
  keys, and the `Delete` key does nothing.
- The header reads "Unsaved changes" after a save that answered 200. Nobody
  has reproduced it.
- Specs and the catalog keep stale words: "panels screen", "ribbon",
  "finding".
- The studio stays a desktop tool at phone width, by decision.
- Stage 43: the studio has no control for step-level validation overrides.

### Detector baseline

The `impeccable detect` source scan reports 22 findings. All of them are the
advisory `design-system-font-size`, for 0.8rem and similar sizes off the
type ramp in `DESIGN.md`. They sit in StepPage (5), FieldMatrixGrid (3) and
ten other files. No finding blocks. The visual language follows the tokens.
The problems lie in structure and flow.

## 2. Findings and the owner's rating

The findings artifact holds the screenshots:
https://claude.ai/artifact/GPynb1dTV5Gc74L5y6aPuV

| Label | Finding | Owner's rating |
|---|---|---|
| B2 | A new process opens on raw Zod messages | important |
| B3 | A key rename breaks guards silently | important |
| M5 | Form building spans three editors | important |
| M9 | The process list prints keys and hashes | important |
| m3 | The Fields tab prints a regex and six open zones | important |
| m4 | "Required" has three names | important |
| B1 | A minted field cannot take a name in the form editor | bothers me |
| M1 | The step page holds 83 controls and echoes JSON keys | bothers me |
| M2 | Selects list keys in place of labels | bothers me |
| M4 | The Checks rail speaks engine and hands off to a dead end | bothers me |
| M7 | The condition builder prints CEL | bothers me |
| M10 | Field matrix density and vocabulary | bothers me |
| m1 | Five chrome rows | bothers me |
| m5 | The Paths tab is read-only, with CEL | bothers me |
| c1 | Cryptic canvas stamps | bothers me |
| c2 | Three registers in the list toolbar | bothers me |
| M3 | Canvas affordances | indifferent |
| M6 | Versions and Player sit in the ⋮ menu | indifferent |
| M8 | A fresh action gets a flag | indifferent |
| M11 | The JSON surface's tab row | indifferent |
| M12 | Versions and Player controls | indifferent |
| M13 | No confirm before a removal | indifferent |
| M14 | Nested scroll at 1024px | indifferent |
| m2 | Nothing after publish | indifferent |
| m6 | Locale controls | indifferent |
| c3 | Login lands in the admin area | indifferent |

The owner's own words: the handling of steps and fields is the main thing
that feels clumsy for a human.

The rating weights the authoring loop over steps and fields above canvas
gestures, navigation chrome and safety prompts. That loop covers the
vocabulary, the place where an author changes a thing, and how many places
one change touches.

## 3. Pattern references and the owner's reaction

The mockups: https://claude.ai/artifact/AS2jX17TL6DLzqZQkmqHXq

| Pattern (source) | Reaction |
|---|---|
| 1. Selection is editing: canvas + side panel (Figma) | dislikes |
| 2. The field is born where it stands: inline block builder (Tally) | likes |
| 3. A person never sees a key: name, type sentence, options as names, rename everywhere (Airtable) | likes |
| 4. One step, one question at a time: vertical list, accordion, errors as sentences (Zapier) | likes |
| 5. Properties as rows with inline pickers (Linear) | dislikes |
| 6. Machine values as chips at the foot (Stripe) | dislikes |

The likes share a guided, form-like shape with sentence labels and one
subject open at a time. The dislikes share density: a side inspector,
compact property rows, visible machine chips. The owner confirmed the
consequence. Machine values stay fully behind the Developer view and off
the page.

## 4. Design principles

<!-- antislop: allow trailing-negation sentence-length passive-voice -->
<!-- Why: the seven principles stand word for word as the owner confirmed them on 2026-10-30. -->
1. One subject at a time. The studio shows one step, one field or one way
   out, with the rest folded. Density is never the goal.
2. The author's words only. Every label is a sentence a non-developer
   understands. A key, an id, CEL or a validator name appears only after the
   author opens the Developer view.
3. Create where it is used. A field is created, named and placed in one move
   inside the form. The catalog is a consequence, not a prerequisite.
4. A change happens once. Renaming, retyping or removing a thing updates every
   place that refers to it, and the studio says in one sentence what it touched.
5. A check result is a sentence at the spot. It stands at the control it
   concerns and says what to do. The Checks tab is only the sum.
6. Progress is visible. Every section says whether it is done. A new process
   starts clean, never with errors.
7. The canvas is the map, not the editor. It shows and selects. Editing
   happens in the guided step list.

The owner confirmed all seven principles and the guess (machine values stay
fully behind the Developer view) on 2026-10-30.

## 5. Author tasks by frequency and weight

1. Steps: create, name, connect, configure.
2. Forms: create, name, place, mark fields required.
3. Conditions.
4. Check, fix, publish.
5. Test in the Player.
6. Timers, actions, notifications.
7. Create a process, rename it, set its access.
8. Versions and migration.
9. Data sources, contract, matrix and JSON, the low-code part.

## 6. Decisions

### D1. Information architecture of the process surface

Options shown: https://claude.ai/artifact/Eeo5PyHxhBiMTSyA9d6874

- A keeps the tab row and guides the step page.
- B adds three primary tabs plus a Views menu.
- C makes one document with no tabs.

The recommendation was B.

**Owner's decision: A, improved.**

The tab row stays the architecture, and the eleven tabs may change. No
Views menu appears.

### D2. The tab cut

Options page: https://claude.ai/artifact/QzSAYxc4CGfbU9Po3HMGap

- Cut 1 has four tabs: Steps, Fields, Checks, Map.
- Cut 2 has six tabs: Map, Steps, Fields, Checks, Changes, Settings.
- Cut 3 has five task tabs with a sub-row.

The recommendation was cut 2.

**Owner's decision: cut 2 with Forms in the sixth slot in place of
Changes.**

The tab row reads Map · Steps · Fields · Forms · Checks · Settings.

Changes moves into the Publish dialog ("N changes since vK · open") and onto
the Versions screen. Test (the Player) stays a header button and a `⋮`
entry. The owner sees the case for a Test tab and may revisit it.

Paths and the per-step form become sections of the step. The field matrix
becomes a view on Fields. Data sources, Contract, Access, key, language,
cancellable and collaboration gather on Settings. The `⋮` menu keeps JSON,
Versions and Player.

### D3. The step page and the form editor

Options page: https://claude.ai/artifact/9CLBf2fENs8ysrCUjUSevm

1. The form becomes a section inside the step.
2. The form editor stays a routed screen. It gains naming on create, and its
   cards carry label and kind. It keeps the tab row, with a breadcrumb in
   the Steps tab and no third nav level.
3. The list stands in the step, and the layout stays in the editor.

The recommendation was 3.

**Owner's decision: 2.**

All three options share one frame, and the owner decided it with them. The
rail stands left. One step opens as an accordion with six sections. They
are Who acts · Form · Ways out · Time limit · When entered / when left ·
More. The section More holds cancellable, comments, attachments and the
Developer view.

A subprocess step swaps Who acts and Form for Which process it calls. An end
step swaps Ways out for How the case ends. No JSON key stands beside a
label. The Form section holds the summary and "Open the form". The old
address `/edit/form/:stepId` keeps working.

### D4. The Fields tab and the rename rule

Options page: https://claude.ai/artifact/5ZV6jZp9vPeEaZEY2CVUqg

Three editor variants:

1. One card in sentences: Name, Kind with a sentence, Choices as names,
   Asked on, Read by. The fold More holds default, validation, values come
   from, and the Developer view.
2. Two halves, folded.
3. One dialog everywhere.

Three rename rules:

- R1: the key follows the name until the first publish, then stays. A key
  change in the Developer view rewrites every reading expression. The
  studio says so in one sentence.
- R2: the studio asks first.
- R3: the studio only warns, as today.

**Owner's decision: editor variant 1 and rule R1.**

The consequences follow. "Required" has one name and lives at "Asked on".
The Fields tab carries a sub-row: Catalog · Where fields appear (the matrix)
· Sources (data sources). A new field kind takes one picker row with a
sentence. Stage 43 becomes a "change" at "Asked on".

The definition contract stays as it is. CEL still reads `data.<key>`. The
studio rewrites source text through the AST ranges the builder already
uses. The Changes list records the rewrite.

### D5 to D8 and the four confirmations

Options page: https://claude.ai/artifact/WsPYZF6Kf2NvmUMP794Vuw

| Decision | Owner's choice | What it means |
|---|---|---|
| D5 | 5a | Checks grouped by subject: Steps, Fields, Before publishing. Severity as a word per row. "fix" jumps to the section. The check kind stays in the row's Developer view. A fresh draft starts with empty lists and no check result. |
| D6 | 6c | Autosave of the draft plus named save points. |
| D7 | 7a | One dialog form for every destructive action. The six `confirm()` prompts go. The control `Remove path` stays dialog-free. |
| D8 | 8a | Two header rows. The banner appears only for a real blocker, as a sentence. Locale badge, key, revision and hash move to Settings and the Publish dialog. The control `Discard draft` moves into the `⋮` menu. |

The owner confirmed four points as proposed:

- The process list prints names as links, no hash, and the actor's name.
- The condition builder prints a sentence in place of the CEL readout.
- The vocabulary table below applies.
- The Map keeps labelled stamps and gains a tooltip on the connect handle.
  A double-click opens the step, and edge labels are sentences that wrap.

The owner's note: the condition builder needs a much larger expansion of its
own. Grouping, field-against-field and date ordering stayed deferred in stage
27b. That expansion is a separate later change, outside this concept's
visual scope.

## 7. Vocabulary table

The table extends `.claude/rules/ui-glossary.md` and the
`studio-guided-vocabulary` spec. Change 2 applies it.

| Contract word | Author's word |
|---|---|
| path | way out (row: "Approve → Done") |
| guard | only if |
| trigger manual / automatic | a person chooses / happens by itself |
| priority | tried first / second / … |
| assignment | who acts |
| timer | time limit |
| onEntry / onExit actions | what happens when entered / when left |
| terminal step | an end |
| subprocess step | a call to another process |
| data source | where values come from |
| contract | what this process takes in and gives back |
| outcome | how it ended |
| required / readonly / visible | required / read-only / asked |
| instance.status, actor.roles | the case's status, the person's roles |

## 8. Cut into changes

Each change ships alone and leaves the studio usable. The order puts the
most value at the least risk first. The Needs column names the change each
one builds on. The Resolves column cites findings by label and entries of
`docs/decisions.md` by heading.

| # | Change | Capabilities and files | Screens | Needs | Resolves |
|---|---|---|---|---|---|
| 1 | `studio-fresh-draft-starts-clean`: A new process starts with every list in place and empty. A fresh draft has no Zod line and no banner. One structural message remains. It becomes a sentence that names its place. | `studio-app`, `studio-checks-rail` | process list (start picker), process surface header | none | B2 (important) |
| 2 | `studio-vocabulary-no-key-echo`: The JSON key printed beside every caption goes. The step page, timers, actions and paths take the vocabulary table. "Required" takes one name on Fields, the form editor and the matrix. The glossary and `studio-guided-vocabulary` follow. | `studio-guided-vocabulary`, `studio-step-page`, `studio-form-editor`, `studio-app`, file `.claude/rules/ui-glossary.md` | Steps, Fields, form editor, matrix | none | M1 (part), m4 (important); decisions: retired words in catalog |
| 3 | `studio-selects-show-labels`: Every step or path select lists labels. Keys derived from labels transliterate umlauts. | `studio-step-page`, `studio-condition-builder`, `studio-canvas` | Steps, timers | 2 | M2, c-umlaut |
| 4 | `studio-condition-sentence`: The summary sentence replaces the CEL readout under the builder. The readout moves into the Developer view. The operands list labels, case and person context last. | `studio-condition-builder` | Steps (ways out), Fields (only asked when) | 2 | M7 |
| 5 | `studio-map-labels`: Stamps carry labels. The connect handle gains a tooltip and a cursor. A double-click opens the step on Steps. Edge sentences wrap. | `studio-canvas` | Map | 4 | c1, M3 (part) |
| 6 | `studio-form-editor-names-fields`: Naming happens on create, inline: the first keystroke is the label. Cards carry label and kind. The palette offers every curated kind, Number included. The palette's "Choice" mints a choice. The tab row stays, with a breadcrumb in the Steps tab. "Put this field on a step" opens the step's form. | `studio-form-editor`, `studio-forms-overview`, `studio-step-page` | form editor, Forms, Steps | 2 | B1, M5 (important) |
| 7 | `studio-field-key-follows-name`: The key follows the label until the first publish. A key change in the Developer view rewrites every reading expression through the AST ranges. It records a Changes row and says "Updated N conditions". "Read by" lists the conditions as sentences. | `studio-app`, `studio-condition-builder` | Fields | 4 | B3 (important); decisions: guard-field-key-renames |
| 8 | `studio-process-list-names`: The name column is the row link. The key moves into a Developer view. Each row reads "v1 · 3 days ago". The draft list API gains the actor's `displayName`, and Saved-by prints it. Import becomes a secondary button. | `studio-app`, `process-drafts` | process list | none | M9 (important), c2 |
| 9 | `studio-six-tabs`: The tab row reads Map · Steps · Fields · Forms · Checks · Settings. Paths folds into the step's Ways out. Field matrix becomes the Fields sub-row "Where fields appear". Data sources, Contract, Access, key, language, cancellable and collaboration gather on Settings. Changes moves into the Publish dialog and Versions. Old addresses map onto the new places. | `studio-process-tabs`, `studio-app`, `studio-publish`, `process-version-inspection`, file `.claude/rules/ui-glossary.md` | process surface | 2 | D2; m5, M10 (part), M6 |
| 10 | `studio-step-accordion`: The step becomes a single column with six sections. Each header carries a summary and a done-state. Check results stand at their section, and one section opens at a time. The control `Remove step` uses the shared dialog. | `studio-step-page`, `studio-checks-rail` | Steps | 9 | M1, M13; decisions: RAIL-6, RAIL-7 |
| 11 | `studio-field-card`: The field editor becomes one card in sentences. It holds Name, Kind with a sentence, Choices as names, Asked on, Read by and More. The Fields sub-row reads Catalog · Where fields appear · Sources. The matrix drops engine words. | `studio-app`, `studio-form-editor` | Fields | 9, 7 | m3 (important), M10 |
| 12 | `studio-checks-by-subject`: Checks group by subject, with severity words. Every engine message maps to a sentence naming step and section. The "fix" control lands on the section. Held-back groups become one line under "Before publishing". | `studio-checks-rail`, `studio-process-tabs` | Checks | 10 | M4; decisions: 22 failure renders (part) |
| 13 | `studio-one-dialog-form`: One `<dialog>` component serves every destructive action. The six `confirm()` prompts convert to it. The focus trap gets a fix. A "Dialogs" entry lands in `DESIGN.md`. | `studio-app`, `studio-form-editor`, `studio-publish`, `spa-accessibility`, file `DESIGN.md` | all dialogs | 10 | D7; decisions: six `confirm()` prompts, dialog presentation gaps, keyboard trap |
| 14 | `studio-header-two-rows`: The process bar holds back, name, state, Test, Publish and ⋮. The banner appears only for a blocker. Locale badge, key, revision and hash move to Settings and the Publish dialog. The ⋮ menu takes `Discard draft`. After publish the bar states the version and offers Versions. | `studio-process-tabs`, `studio-app`, `studio-publish` | process surface | 9 | m1, m2 |
| 15 | `studio-draft-autosave-and-save-points`: A debounced PUT follows each change, with "Saved just now". A 409 behaves as today. Named save points live per draft, and the `process-drafts` API gains them. Publish no longer saves first. The Player loses its unsaved prompt. | `process-drafts`, `studio-app`, `studio-publish`, `studio-player` | process surface, Player | 14 | D6 |
| 16 | `studio-condition-builder-expansion`: From the owner's note. It adds grouping, field-against-field and date ordering. It gets its own design pass. | `studio-condition-builder`, `cel-expressions` | Steps, Fields | 4 | stage 27b deferrals |

The owner rated some findings "indifferent", and the cut leaves them out:

- Versions and Player out of the `⋮` menu (M6, M12).
- The JSON surface tab row (M11).
- The 1024px nesting beyond what change 10 fixes (M14).
- The login landing (c3).

No change in the list touches `src/schema/definition.ts`. Two changes touch
the API: 8 (the actor's `displayName` in the draft list) and 15 (save
points). Both stay outside the body and the hash.

## 9. Where the concept lives

The owner chose option (a) on 2026-10-30. An open stage 64, "Studio UI
overhaul", in `ROADMAP.md` carries the seven principles and the ordered
change list. This file carries the full design record with the artifact
links. The change `studio-ui-concept-record` brought both into the
repository.

## 10. Artifacts

The seven artifacts are private and date from 2026-10-30. They hold the only
copy of the mockups and the screenshots. Nothing in the repository depends on
them.

- Findings: https://claude.ai/artifact/GPynb1dTV5Gc74L5y6aPuV
- Patterns: https://claude.ai/artifact/AS2jX17TL6DLzqZQkmqHXq
- D1: https://claude.ai/artifact/Eeo5PyHxhBiMTSyA9d6874
- D2: https://claude.ai/artifact/QzSAYxc4CGfbU9Po3HMGap
- D3: https://claude.ai/artifact/9CLBf2fENs8ysrCUjUSevm
- D4: https://claude.ai/artifact/5ZV6jZp9vPeEaZEY2CVUqg
- D5 to D8: https://claude.ai/artifact/WsPYZF6Kf2NvmUMP794Vuw
