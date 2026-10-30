# Design

## Context

See `proposal.md`, Why. The empty choice lives in
`screens/processListLogic.ts::seededDraftInput`. It returns
`{ body: { baseLocale: "en" }, layout: {}, revision: 0 }`.

The function `draft/validation.ts::runValidation` passes the draft to
`validateStructure` (`src/validate.ts`). Each Zod issue becomes an
`EditorIssue` with source `zod`. The function `resolveLoc` places a
top-level path on the process. The header bar's `IssueList
entityId="process"` then prints each one with its "ZOD" source label. The
banner at `EditScreen.tsx:967` shows on `!validation.zodValid`.

Measured on 2026-10-30 against `validateStructure`, in the devcontainer:

| Body | Zod issues |
|---|---|
| `{ baseLocale: "en" }` (today) | `key`, `label`, `fields`, `workflow`: four "expected …, received undefined" |
| every list empty: `key: ""`, `label: {}`, `fields: []`, `workflow: { steps: [] }` | one: `workflow.initialStep`, "expected string, received undefined" |
| the same plus one named end step, `initialStep` set, `label: {}` | one: `label`, "missing baseLocale ('en') entry" |
| the same, process named | none; the compile pass runs |
| every list empty plus the minted task step | three: no way out, no process name, no step name |

The `superRefine` that checks `label` runs only once the object shape
parses. A stepless draft therefore never reports the name gap. The two gaps
come one after the other, never together.

The last row is the path a real author takes. "Add step" mints a task step
through `newStep`, with the label `{ en: "" }`. Its issues sit at
`workflow.steps.0.paths`, `label` and `workflow.steps.0.label`. That step has no way out and no name, and both
are Zod refinements. So the banner returns at the first "Add step". This
change leaves those two step messages as they are; see Risks.

## Shape brief

The owner confirmed this brief on 2026-10-30. It comes from `/impeccable
shape`, run on the header bar of a fresh draft. The mode is Operate.

1. **Job and audience.** A process author just picked "Empty process". They
   need a calm start (principle 6). They also need to see what comes next:
   type a name, add a first step.
2. **Outcome.** The new draft seeds every list empty, so the four Zod lines
   go. No banner and no line reading "zod" stand in the header. The Checks
   tab's count reads 0.
3. **The start state.** The one remaining message is no check result. The
   Publish control states a reason in the muted tone. It stands where
   "Blocked by an open issue" stands today. The checks rail states one
   sentence in place of "No open issues." That sentence names where to add
   the first step. The steps rail keeps its own empty sentence.
4. **The name.** A process with a step and no name shows a sentence. It
   stands at the name in the header bar, with no Zod label.
5. **The banner.** It stands only for a Zod issue outside those two gaps.
6. **Untouched.** `src/schema/definition.ts`, the header bar's layout
   (revision, saved state, locale badge, Save, Discard draft) and the
   template start. Two header rows come with change 14. Grouping by
   subject comes with change 12.
7. **Left out on purpose.** No sentence on the empty canvas: it belongs to
   `studio-canvas` and to change 5. No filling of a stored
   `{ baseLocale }`-only draft at load: nothing deployed holds one.

## Goals / Non-Goals

**Goals:**

- A fresh draft shows no Zod text, no banner and no check count.
- Each of the two start gaps reads as one sentence that names its place.
- Every other Zod issue keeps today's rendering and today's banner.

**Non-Goals:**

- Mapping any other engine message to a sentence. Change 12 does that for
  every message, and FIELDS-8 keeps its field-label instance until then.
- Changing what `zodValid` means, or any held-back rule for a draft that
  holds a step.
- A canvas empty state, two header rows, or the six-tab row.

## Decisions

### D1. The seeded body

The empty choice returns this body:

```json
{ "key": "", "label": {}, "baseLocale": "en", "fields": [], "workflow": { "steps": [] } }
```

The body has no `initialStep`. No value makes it valid without a step. An
empty string fails the `step_` pattern and the resolution check. It brings
three issues in place of one.

*Alternative rejected:* seed a start step. The concept says every list
empty. A step the author did not create also needs a name the author did
not choose.

### D2. The studio recognizes the start state

The function `runValidation` reads one condition. The draft's
`workflow.steps` is an array of length 0. Then every Zod issue at the exact
path `workflow.initialStep` becomes no `EditorIssue`, and `ValidationResult`
carries `noStepYet: true`. A missing and a dangling `initialStep` both
count.

A draft with no `workflow` key is no start state. The field
is optional, and an absent value reads false. About 14 test fixtures hold a
`ValidationResult` literal, and none of them needs to change.

A new pure module, `draft/startGaps.ts`, holds both tests and the banner
predicate of D4. A unit test reaches each one without a render.

`zodValid` keeps its meaning, the engine's own Zod verdict, and reads false
here. The held-back rules read it. Flipping it would let the duration and
view groups claim a run they never made.

*Alternative rejected:* a schema change that lets `initialStep` be absent
while `steps` is empty. The task forbids touching `src/schema/definition.ts`,
and the engine has no use for a stepless body.

### D3. The name gap reads as a sentence

The `processBody` superRefine raises "missing baseLocale" as a Zod issue.
It sits at the exact path `label`, with code `custom`. Nothing else raises
a custom issue at that path today. The function `runValidation` keeps it as an
`EditorIssue` with source `zod`, so it still counts and still blocks. Its
`message` becomes the catalog sentence, and the issue carries
`plain: true`. `IssueItems` prints no source label for a `plain` issue. The
header bar's process `IssueList` already places it beside the name.

In the checks rail the issue stays in the `zod` group, under that group's
heading. Change 12 regroups the rail by subject.

### D4. The banner gate

The banner reads one exported predicate, `showsStructuralBanner(validation)`.
It returns true when `validation.issues` holds a `zod` issue that is not
`plain`. A fresh draft holds none, and an unnamed draft holds only the
`plain` one. A stepless draft that also carries some other Zod issue still
shows the banner.

### D5. The checks rail's start state

With `noStepYet` and no open issue, the rail renders one paragraph, the
start sentence, and no group. The all-clear state stays hidden, so
`studio-publish`'s two-statement all-clear never claims a stepless draft is
ready. With `noStepYet` and some open issue, the sentence comes first and
the groups follow under their current rules.

The Checks count's color needs one more step. The function
`draft/checksRail.ts::checksDotState` reads a held-back group as a blocker.
In the start state no group has run, so the count would read a bold
refusal-colored 0. The function takes a second argument, `noStepYet`. When
it holds and no group carries an issue, the function returns `clear`. Both
callers pass `validation.noStepYet`: `screens/EditScreen.tsx` for the tab
row, `panels/ProcessHeaderBar.tsx` for the header's `blocked`.

The function `groupChecksBySource` keeps its held-back groups. So
`allChecksClear` stays false, and the all-clear state stays hidden without
a second rule.

### D6. Publish in the start state

`publishAvailability(canPublish, blocked, noStepYet = false)` answers the
permission first, exactly as today. The default keeps every two-argument
call compiling. Next, `noStepYet` returns
`{ available: false, reasonKey: "draftToolbar.publishNeedsStep" }`. The
control then renders the way the permission case renders. It carries
`aria-disabled="true"`, keeps focus, references the reason through
`aria-describedby`, uses the muted tone and sends no request.

Two components call the function: `PublishNavControl` and `PublishReasonLine`.
Each gains a `noStepYet` prop. The header bar passes `validation.noStepYet`
to both.

*Alternative rejected:* keep Publish available with a pre-click reason, the
way a blocker does. A click would open the dialog. The engine would then
answer with a raw Zod 422, the message class this change removes.

### D7. The strings

All three sit in `packages/web/src/i18n/catalogs/studio.ts`, English only,
as the studio catalog is:

| Key | Text |
|---|---|
| `checksRail.noStepYet` | No step yet. Add the first step on the Canvas or the Steps tab. |
| `draftToolbar.publishNeedsStep` | Publish needs a first step |
| `issues.processNeedsName` | The process needs a name. Type it in the name field at the top of the page. |

The tab names follow today's tab row. Change 9 renames Canvas to Map, and
it updates this string with the rest.

### D8. Spec encoding

`studio-app`'s scenario "The empty choice behaves as before" states the
rule this change reverses. A MODIFIED block must keep every base scenario
by name. So the delta removes "Creating a new process mints a prefixed id
client-side". Two ADDED requirements succeed it, since one would pass the
500-character limit. The first is "A new process mints a prefixed id
client-side in one write". The second is "The empty choice seeds every list
empty".

At sync, both move to the removed requirement's place. The other three
capabilities take MODIFIED blocks that keep every scenario, plus ADDED
requirements in `studio-checks-rail`.

## Risks / Trade-offs

- [The first new step brings the banner back] → Any new step starts
  unnamed, so the step-name refinement raises it. The step may be an end,
  a call or a task. The task step adds the missing way out too.
  The calm start lasts until the first "Add step". Change 14 narrows the
  banner to real blockers. Change 12 maps the step messages to sentences.
- [Change 12 supersedes `plain` and the name mapping] → Its own message
  map takes over both. The module `draft/startGaps.ts` then shrinks to the
  start-state test. No later change has to undo this one.

- [A Zod upgrade renames an issue code or path] → The raw line returns.
  The tests feed real `validateStructure` output, so such a drift turns them
  red.
- [The Checks count reads 0 while Publish is unavailable] → The reason
  beside Publish names the missing step. So does the rail's sentence.
- [FIELDS-8 stays half open] → A new field with no label still raises the
  banner. Non-Goals says so, and `docs/decisions.md` records the closed
  part.
- [A stepless draft with another Zod issue shows both] → That is correct.
  The banner speaks for the other issue.

## Migration Plan

No migration. A draft stored before this change keeps its body. Its
`workflow` is missing rather than empty, so today's rules render it. A
revert of the change's commit rolls it back.

## Open Questions

None.
