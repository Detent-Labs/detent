## Context

See `proposal.md` - Why. Two facts from the current code shape every
decision below:

- `postComment` and `uploadAttachment` (`src/runtime/api.ts`) already call
  `loadInstanceForActor(instanceId, actor, db)`, which returns
  `{ instance, body }` — both already discard `body`. `getInstanceView`
  calls the same helper and already resolves `const step = findStep(body,
  instance.currentStepId)` to build its response.
- `InstanceComment`/`InstanceAttachment` have no `stepId`. They are pure
  instance-scoped records with no link to the step active at creation.
  Adding one is out of scope (see Non-Goals).

## Goals / Non-Goals

**Goals:**
- Let a process declare a default for whether comments/attachments exist,
  and let any step override either independently.
- Enforce the resolved option where the Runtime API Layer writes the
  data. The UI must not be the only enforcement point, or a non-browser
  integration could bypass it.
- Never hide history: a field that a later step disables still shows
  everything recorded while it stayed enabled.

**Non-Goals:**
- No `stepId` on `InstanceComment`/`InstanceAttachment`, and no filtering
  of history by its originating step. The config only ever gates the
  *current* step's add-affordance.
- No admin-area change. Comments/attachments have no admin-area presence
  today (confirmed by search: zero references under
  `packages/web/src/areas/admin`), and this change doesn't add one.
- No generic collaboration-plugin registry. Two fixed boolean fields is
  the whole scope; a third field, if one is ever needed, extends the same
  `collaboration` object rather than motivating a registry now.
- No Studio Player comment/attachment UI. The Player has none today: its
  `api/client.ts` exposes only `getInstanceView`/`createTestInstance`/
  `claimStep`, so there is nothing existing to make conditional. An
  earlier draft of this design wrongly assumed the Player already showed
  this content. That draft misread a code comment about shared Runtime
  API Layer routes as evidence of comment/attachment routes specifically.
  Giving the Player that UI from scratch is a separate, future change.
- No new Zod refinement. `comments` and `attachments` are independent
  optional booleans with no cross-field constraint: every combination is
  a valid body. This change therefore does not add an authoring invariant
  and does not need a "rejects a violating input" test.

## Decisions

**Schema shape: one `collaboration: { comments?, attachments? }` object**.
It sits on both `ProcessBody` and `Step`, resolved per key.
It mirrors `assignment`/`subprocess`, config-grouping objects, instead
of two flat booleans. That combination has no precedent in
`definition.ts` today.

Resolution works per-key
(`step.collaboration?.comments ?? processBody.collaboration?.comments ??
true`) rather than per-object. A step can therefore override just one
field. That's exactly the brief's own example. A step that keeps Comment but
drops Attachments needs to state only the one key it changes.

Considered and rejected: a combined enum (`"none" | "comments" |
"attachments" | "both"`). Every other per-step/per-view option in this
schema is an independent optional flag. An enum would need restructuring
if a third collaboration primitive ever appears. Also considered and
rejected: modeling comments/attachments as `View`/`ViewField` entries,
which reference real `FieldId`s from the field catalog. Comments/
attachments are not `data`, so conflating them with the catalog would
breach the definition contract's "Data vs presentation" separation.

**Override model: a step's own option always wins, in either
direction**. A step's override is symmetric. It may enable what the
process default disables, or disable what the default enables. Confirmed
with the user against the concrete case. The process default sets
`attachments: false`, and one step overrides it to `attachments: true`.
Default `true` applies wherever an author sets neither key, matching the
current unconditional behavior. So no existing example or published
instance changes shape, and no `definitionHash` moves for such a body.

**Enforcement lives in the Runtime API Layer, not only the HTTP wrapper
or the UI**. `postComment`/`uploadAttachment` keep the `body` that
`loadInstanceForActor` already returns (today both discard it), resolve
`findStep(body, instance.currentStepId)` (the same helper
`getInstanceView` already uses), and check the resolved flag before the
`INSERT`. This is the layer the engine documents as "the in-process
boundary that runs an instance". Placing the check here, rather than
only in `src/http/routes.ts`, matters for the stated headless/API-first
design. A caller that reaches the engine without HTTP still gets the
same rule. This change leaves `listComments`/`listAttachments`
untouched. The check gates only the write path, so history stays
visible after a later step disables further additions. Confirmed with
the user against the concrete case of an attachment uploaded on an
earlier, attachments-enabled step.

**New `CollaborationDisabledError`, mapped to HTTP 409**.
`src/http/errors.ts` splits its error table by kind: 403 for
identity/authorization refusals (`NotClaimantError`, `AuthorizationError`,
...), 409 for state-based refusals (`InstanceNotRunningError`,
`GuardRefused`, `DraftConflictError`, ...). Whether a step disables
comments or attachments is a fact about the instance's current state. It
is not a fact about who the actor is, so it follows the 409 family.
`error.type: "collaboration-disabled"` follows the existing per-condition
requirement-per-route-family convention in `http-wrapper`. It matches
the existing "403 on either comment route" / "403 on any attachment
route" pair. The new response does not fold into the existing POST
requirements.

**On the engine type, `getInstanceView` exposes a pre-resolved
`collaboration: { comments: boolean; attachments: boolean }`, never
optional booleans**. Same pattern `columns`/`tabs` already follow
(`step.view?.columns ?? 1`): the server resolves the fallback chain once,
and the frontend never re-implements process/step precedence. This keeps
the resolution logic in exactly one place (it is also where enforcement
reads it, in `postComment`/`uploadAttachment`).

The frontend mirror is a different case. The `InstanceView` interface
in `packages/web/src/areas/app/api/types.ts` types every field the
engine added after the type's original shape as optional. Two such
fields, `columns?` and `tabs?`, carry an explicit comment there. It
reads: "Optional here, unlike on the engine's own type, a response
predating the key omits it."

That established, twice-applied precedent now covers `collaboration`
too. This frontend mirror types it as `collaboration?:` specifically,
even though the engine-side type never lets it be `undefined`. The
admin area's own, deliberately narrower `InstanceView` mirror
(`instanceId`/`processId`/`version`/`status`/`step`/`redactedAt` only)
does not need a change. The `collaboration` field stays invisible to it,
confirming the "no admin-area change" Non-Goal above.

**Studio placement, per capability ownership confirmed via `openspec show`:**
- Process-wide default: two checkboxes in `ProcessHeaderBar.tsx`,
  governed by `studio-process-tabs`. That capability already owns "The
  process header bar SHALL carry three controls..." The header bar
  itself belongs to `studio-process-tabs`, rather than to `studio-app`
  or `process-drafts`. Of the two, only `process-drafts` owns the
  server-side draft store.
- Per-step override: a new "Collaboration" section in `StepPage.tsx`,
  governed by `studio-step-page`. That capability already enumerates
  every section by name in its two-column layout requirement. Extending
  that enumeration is the natural, minimal hook.

**`sectionsFor.ts`, not `stepType` directly, gates section visibility**.
`StepPage.tsx`'s section switch only ever receives a section
name that `packages/web/src/areas/studio/panels/sectionsFor.ts` already
decided to return: the closed `SectionName` union, the `TRAILING`/
`LEADING` column arrays, and the `PARTICIPANT`/`TERMINAL`/`SUBPROCESS`
arrays live there, keyed by a `PerformedBy` axis
(`packages/web/src/areas/studio/draft/performedBy.ts`,
`"participant"|"subprocess"|"terminal"`, terminal winning over
subprocess) that is distinct from the schema's own `StepType`
(`"task"|"subprocess"`). An earlier draft of this design reasoned
directly from `stepType`/`terminal` and never named `sectionsFor.ts`.
Without that change, `SectionName` never gains "Collaboration", and no
step returns it. The section could then never appear, regardless of
what `StepPage.tsx` itself does. The fix adds `"collaboration"` to
`SectionName`, `TRAILING`, `PARTICIPANT` and `TERMINAL`, excluding only
`SUBPROCESS`. That reproduces exactly the intended visibility: task and
terminal steps get it, a subprocess step doesn't. This works through the
mechanism that already governs visibility.

**Per-step control is a three-state selector: process default, on, or
off**. The step-level value is a genuine three-state (inherit / true /
false), which a two-state checkbox cannot represent without a second
control. Confirmed with the user via a side-by-side mockup against a
checkbox-plus-"use default"-link alternative. The user picked the
three-explicit-states model over checkbox-plus-link.

**Realized as a Segmented Control**. `DESIGN.md` and
`.claude/rules/design-language.md` (loaded via `impeccable context` for
this change) document no dropdown/select pattern anywhere in this
codebase's design language. They document a Segmented Control instead:
options sit in one row sharing edges inside a 1px hairline box. A
pressed option takes an accent border, accent text and the open mark.
That makes it a first-class, already-styled fit for exactly three
mutually exclusive options.

Each field (Comment, Attachments) gets its own Segmented Control with
three short options: "Default", "On" and "Off". A `<select>`'s longer,
variable-width option text would not fit the Segmented Control's
shared-edge layout. Introducing an unstyled native dropdown into an
otherwise fully StyleX-compiled design system would also raise a flag.
It would be the second mechanism this project's own review checklist
warns against.

The default option's own label always stays the fixed word "Default",
regardless of the currently-resolved value. That value shows instead as
a small caption under the control. The caption sits in slate, at the
Timeline pattern's 0.8rem meta-text size, for example reading "Currently:
on". It appears only while "Default" is the pressed option. This
satisfies the requirement that an author can see the effective default
without widening the control's per-option text.

This shape pass substituted a direct inference from the already-loaded
`DESIGN.md` tokens for Impeccable's full interactive interview
(structured questions / decision page). The scope stays narrow: two
small additions to existing, already-styled screens, short of a new
surface. The skill's own autonomy-directive check requires disclosing
any such substitution here, rather than silently skipping the
interview.

**Process-wide checkboxes follow the same design system's existing
checkbox token**. The rule comes directly from `DESIGN.md`: "A checkbox
or radio drops the border and takes `accent-color`". The Field
Matrix's own flag checkboxes already follow that same rule. The two
`ProcessHeaderBar.tsx` checkboxes are plain native checkboxes styled
that way, each with its label ("Comment", "Attachments") to its right.
They sit grouped with 8px spacing. That is the Filter Bar's spacing
convention for a row of related controls. That group sits in the header bar's
inline-editable cluster after `baseLocale`, distinct from the
three right-aligned Save/Discard draft/Publish controls.

**Collaboration section excluded for subprocess steps, included for end
(terminal) steps**. A subprocess step is a synchronous, automatic
wait-state with no participant-facing task screen at all. That is the
same reason it has no `Assignment` section. An end step still resolves
an `InstanceView` and its `collaboration` field. `getInstanceView`'s
`availablePaths` already special-cases only `instance.status ===
"running"`, confirming that nothing similarly gates `collaboration`. So
its Collaboration section stays.

**`CollaborationDisabledError` gets its own row in the Task screen's
existing typed-error table**. This table stays closed: `end-user-app`'s
"Typed engine errors map to a legible, distinct UI treatment"
requirement defines it. The Task screen reads it to give six other
engine errors a distinct treatment. `collaboration-disabled` is
reachable there too. An author might disable the field after the
participant's view already loaded. That is a stale-view case, beyond
the ordinary case where the control is already hidden.

It gets the same "reload the view and report" shape the existing
OCC-conflict row already uses. Both are "the state you were looking at
moved on" cases.

## Risks / Trade-offs

- **A step's Collaboration section becomes stale-looking if the process
  default changes after the step overrides one key**. Mitigated by the
  control's caption, which always names the *current* resolved default
  while Default stays pressed (see `studio-step-page` spec). It is also
  mitigated by the schema, which keeps override and default as
  independent values. It never snapshots the default at override time.
- **A participant mid-session could see an add-control disappear if an
  author disables it while the instance sits there**.
  Existing behavior already accepts this class of risk for other
  step-resolved UI. For example, available paths change when a
  definition gets republished and the instance migrates. No new
  mitigation exists beyond the manual-refresh pattern: `studio-player`'s
  "manual refresh, no polling" note applies equally to the Task screen.
- **Seven capability specs touched for a conceptually small feature**.
  Accepted: each delta is small, one or two requirements. The
  alternative, a new single umbrella capability, would duplicate
  wording. `end-user-app`, `runtime-api`, `http-wrapper` and
  `definition-contract` already carry that wording for the surrounding
  comment/attachment behavior this change only conditions.

## Migration Plan

Purely additive: `collaboration` is optional on both `ProcessBody` and
`Step`, absent reads as `true` at every resolution point, so no existing
example, draft, published version, or running instance changes behavior
or `definitionHash`. No database migration: `instance_comments`/
`instance_attachments` are unchanged. No feature flag: the new fields are
inert until an author sets one. Ordinary deployment (no dark launch, no
staged rollout) is enough.

Rollback is a plain revert. Nothing written by this change, an
author-set `collaboration` key inside a published `ProcessBody`, is
unreadable by the prior code. Code that doesn't recognize a Zod
`.optional()` field ignores it outright. A published body carrying
`collaboration` still parses under the pre-change schema shape
(superset); it has no effect there.

## Open Questions

- Three copy items stay open. They are the header bar's two checkbox
  labels, the Segmented Control's three option words, and the
  "Currently: on/off" caption. Their exact translated wording is an
  i18n-catalog detail, resolved during implementation and following this
  repo's existing UI-string process. It doesn't change any requirement
  above. This design fixes the English source strings: "Comment",
  "Attachments", "Default", "On", "Off", "Currently: {value}".
