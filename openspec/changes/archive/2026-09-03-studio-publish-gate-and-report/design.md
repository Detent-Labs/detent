## Context

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" is the fixed term for this screen (ui-glossary.md:45). -->
The studio edit screen carries one publish control. It sits in the kebab
menu of `ProcessHeaderBar`. Line 380 of `EditScreen.tsx` mounts
`useDraftToolbarActions` once, and passes the result to that header at line
417. The hook owns the save, discard and publish calls. It also owns the
pending flags and the failure string.

The server side is already correct. `handlePublishDraft` in
`src/http/studio-routes.ts:181` runs `requireAuthoring(actor)` and then
`requirePermission(actor, "publish", processId, db)`. The 403 a developer
without `system:publish` receives is the engine working as `studio-publish`
specifies. Nothing in this change relaxes it.

## Goals / Non-Goals

**Goals:**

- The studio offers Publish only to an actor the engine would admit.
- An unavailable Publish states its reason on screen.
- A refused publish, save or discard reaches the developer's eye and their
  screen reader.
- Publish and discard confirm in the product's own dialog. Each names the
  facts that matter before an irreversible act.

**Non-Goals:**

- The seven other studio prompts. Proposal.md states that boundary.
- The stale "Unsaved changes" badge after a 200 `PUT`. Diagnosed below,
  fixed elsewhere.
- Any change to the server's publish authorization.
- A new dialog component, a new CSS block, or a new design token.

## Diagnosis: why the 403 left no mark

The state reaches the component. The rendering hides it.

Five links carry the message from the failed request to the DOM:

1. `useFail` at `shell/useFail.ts:24` special-cases 401 alone. A 403 falls
   to `onError`, which calls `setError(describeCaughtError(e))`.
2. The `describeCaughtError` helper tests for a `StudioClientError`. Line 18
   of `client.ts` re-exports `AppClientError` under that name, so the test
   matches. Then `describeError` maps the `authorization` type to
   `t("error.authorization")`.
3. That key exists. Line 434 of `i18n/catalogs/studio.ts` reads "You don't
   have permission to do that."
4. Nothing unmounts the state. The `load` callback in `EditScreen` lists
   three stable dependencies, so its effect runs once. No `key` sits on
   `EditorArea`, so a save triggers no remount.
5. Line 292 of `ProcessHeaderBar.tsx` therefore renders a `p` element with
   the class `studio-error` and that sentence inside it.

The message renders. It is not perceivable.

The `studio-error` rule at `app.css:87` sets one property, `color`. The
paragraph is a direct child of `studio-header-bar`. Line 2293 makes that a
wrapping flex row aligned on the baseline. So the message becomes one more
inline item on a wrapped line, after ten badges and the kebab trigger.
Those ten include the revision badge, the dirty badge and the timestamp.
They also include the published stamp, the locale badge and two tabs.

The paragraph carries no alert role, so no screen reader announces it. It
carries no border, no stamp and no background. So nothing separates it from
the badges beside it.

The same screen already knows better. Line 643 of `EditScreen.tsx` renders a
load failure as `studio-error-banner` with an alert role and an explicit
`error.failed` stamp. The mutation path never received that treatment.

Task 1.1 reproduces the 403 and confirms this reading before any fix lands.
The reproduction is cheap: seed `demo-developer`, open a draft, publish.

The run against the build confirmed every link, and corrected none.
`POST /drafts/:id/publish` answered 403 with the `authorization` type. The
header bar then held one `p` element of class `studio-error`, reading "You
don't have permission to do that." It sat last in the row, after the revision
badge, the saved badge, the locale badge and the two tabs. The screen carried
no element with an alert role at all.

## The impeccable shape brief

Mode: **Operate**. The developer is mid-task, on a screen they know, and
they need to finish or to learn why they cannot.

The prompt was precise, and this repository already fixes the visual world.
Both `DESIGN.md` and `.claude/rules/design-language.md` bind, and the
`studio-dialog` pattern already exists. So this brief asserts the reading
rather than opening an answer round. Two notes below mark an assumption.

### Job and audience

A process author or a developer opens a draft on that screen.
They mean to publish. Success is a published version they can name. The
second success, equally valid, is a clear refusal they can act on.

### The unavailable Publish affordance

Publish stays rendered and marked unavailable. It does not disappear.

A hidden control teaches nothing. The developer looks for it, fails to find
it, and blames the screen. An unavailable control with no reason is no better.
The product principle "explicit beats implicit" refuses both.

So the menu item renders unavailable, and one line of slate label text renders
directly beneath it, inside the menu:

```
  Publish                                    [unavailable]
  NEEDS THE PUBLISH PERMISSION FOR THIS PROCESS
```

That line takes the label role from `DESIGN.md`: 11px, uppercase, 0.1em
tracking, slate. The menu's own group heading already gets that treatment
through `studio-header-bar-menu-label`, so no new class appears.

The item and its reason line sit together in a `role="group"` inside the
menu panel. A `role="menu"` admits `menuitem`, `group` and `separator` as
children. A bare `<p>` is none of those. The panel's existing
`studio-header-bar-menu-group` already implies that shape.

**`aria-disabled`, not the native `disabled` attribute.** The Save item uses
`disabled` for its pending state (`ProcessHeaderBar.tsx:219`). The Publish
item does the same at `:230`, and that pending disable stays.

The permission state needs a different mechanism. A natively disabled button
takes no focus. Nothing then reads its `aria-describedby`, and the reason a
blind developer needs is the one they never hear. The Publish item therefore
adds `aria-disabled="true"` and keeps its `tabindex`. Its click handler
returns early.

The dimmed treatment comes from the rule that already exists:
`button[role="menuitem"]:disabled` at `app.css:2407` takes
`button[role="menuitem"][aria-disabled="true"]` into its selector list. That
is the change's one CSS edit, and it adds no rule and no declaration.

The reason is text, never a `title` tooltip. A `title` reaches neither the
keyboard nor a screen reader. The delta this change adds to `studio-publish`
says so. The item carries `aria-describedby` pointing at the reason line, so
a screen reader reads the control and its reason together.

The reason names the permission, not the role. The global `system:publish`
role is one of two routes to that permission. A scoped grant is the other,
and `studio-publish` already specifies both. Naming a role would mislead an
author whose administrator means to grant them the process instead.

### The publish dialog

One dialog replaces two prompts. Today a dirty draft raises a save prompt,
and the publish itself raises none. The dialog covers both.

```
  +----------------------------------------------+
  |  Publish this draft                          |
  |                                              |
  |  PROCESS      Expense approval               |
  |  PROCESS ID   proc_01J...                    |
  |  REVISION     7                              |
  |  NEXT VERSION v4                             |
  |                                              |
  |  This draft has unsaved changes. Publishing  |
  |  saves them first.                           |
  |                                              |
  |  A published version can never change. To    |
  |  correct it, publish a new one.              |
  |                                              |
  |  [ Publish ]  [ Cancel ]                     |
  +----------------------------------------------+
```

The fact list reuses the existing `studio-dialog-facts` grid: a slate label
column and a value column. Process id and next version print in mono,
because the engine matches both exactly. The process label prints in the
written face.

The unsaved-changes sentence renders only when the draft is dirty. The
immutability sentence always renders, as `studio-dialog-note`.

Publish takes `btn-primary`, the one filled action in the dialog. Cancel
takes `btn-ghost`. A refused publish renders inside the dialog and leaves it
open, exactly as `PromotionPreviewDialog` already does and documents. Its
`showModal()` call puts the dialog in the top layer, so a banner behind it is
inert and dimmed.

### The discard dialog

Same shape, same class, different facts and a different verb.

```
  +----------------------------------------------+
  |  Discard this draft                          |
  |                                              |
  |  PROCESS      Expense approval               |
  |  REVISION     7                              |
  |  LAST SAVED   14:02:11                       |
  |                                              |
  |  The published versions stay. Only the       |
  |  unpublished draft goes.                     |
  |                                              |
  |  [ Discard draft ]  [ Cancel ]               |
  +----------------------------------------------+
```

Discard draft takes `btn-destructive`. The Never Green Rule in `DESIGN.md`
fixes that treatment: a destructive action stays outlined in the accent and
never fills red.

### The failure region

A failed save, discard or publish renders in `studio-error-banner` with an
alert role. It sits as a block after the header row, not as an item inside
it. That reuses the shape `EditScreen` already gives a failed load at line
643.

**How the banner leaves the flex row.** `ProcessHeaderBar` returns one
element today, `<header className="studio-header-bar">`. That header is
`display: flex; flex-wrap: wrap` (`app.css:2293`). A bordered banner placed
inside it is still a flex item on a wrapped line, not a block.

Two ways out: give the banner `flex-basis: 100%`, or return a fragment. The
fragment wins. The header's parent is `.studio-edit-screen`, a flex column.
A sibling of the header is already a full-width block there:
`.draft-incomplete` at `EditScreen.tsx:410`. It needs no CSS. It also stops the
failure report sitting inside a `<header>` element, where it never belonged.

The conflict paragraph at `ProcessHeaderBar.tsx:294` leaves the header in the
same move. It takes the same banner shape, and keeps its Reload button as the
banner's message content.

**The three other bare paragraphs.** Each renders
`<p className="studio-error">`, a class that sets color and nothing else.
Each takes the banner with an alert role instead.

- `EditScreen.tsx:457`, no such form step
- `EditScreen.tsx:659`, no draft for this process
- `EditorDock.tsx:153`, the diff load failed

The added `spa-error-reporting` requirement is then true of that chrome on the
day it lands. The panels the screen mounts keep the older rule. The other 22
sites in `packages/web` are the named follow-up proposal.md records.

The `.studio-edit-screen > *` comment at `app.css:123-127` names
`studio-error` as one of three children whose browser margin that rule
neutralizes. After this change the screen's own chrome renders no
`studio-error` paragraph. The rule is a direct-child selector, so it never
reached the JSON view's own one either. That paragraph sits inside
`.studio-json-view`, which is what `EditScreen.tsx:594` mounts.

Task 8.8 restructures that comment rather than swapping one name for another.
A swap in place would read false twice. The banner is a `div`, not a
paragraph. Its top margin comes from `app.css:702`, not from the browser.

The `.draft-incomplete` paragraph carries no browser default either. Line 134
of `app.css` states its margin on the scale.

The comment has to name what the rule now neutralizes. That is an authored
top margin on the banner. The banner becomes a direct child once the header
returns a fragment. It sets `margin: var(--space-3) 0`, and this rule zeroes
the top half.

When a dialog is open, the failure renders inside the dialog instead. Two
alert regions for one failure would announce it twice.

## Naming the version the publish mints

The dialog states a next version. The engine assigns the real number, and
the client cannot know it before the call.

Three options, and the friction each costs:

| Option | Cost | Verdict |
|---|---|---|
| Read the version list when the dialog opens | One request, a loading state, a stale window of its own | Rejected |
| State no version at all | The dialog fails the one job it has | Rejected |
| Predict from the draft's own base version | One expression, no request | Chosen |

`EditorArea` already folds the publish result's version over the loaded
`baseVersion` for the dock. That value is the freshest version this session
knows. The dialog reads it and prints the next number, or `v1` when it is
null.

The prediction can be wrong. Another environment can promote a version
through `POST /processes` between the load and the publish. So the label
reads "Next version", not "Version". The header's own published stamp then
prints the number the engine assigned. An author who cares reads that
stamp.

**Assumption, marked.** A wrong prediction is acceptable, because the real
number appears one second later on the same screen. The cheaper honest
alternative is to drop the row. If the owner prefers exactness, the first
option is a small change and the spec scenario below stays as written.

## The stale "Unsaved changes" badge

After a 200 `PUT`, the header kept reading "Unsaved changes".

The path looks correct on the page. A defined save result makes `doSave`
call `onSavedBodyChange(draft)`. Line 386 of `EditScreen.tsx` clones that
body into `savedBody`. Then `dirtyNow` compares the two by serializing
both. So either something re-dirties the draft after the save, or the save
returned nothing. Both readings need a reproduction that this change does
not run.

**Assumption, marked.** It is a dirty-state failure in `EditorArea`, not a
publish failure. It shares no file with the three failures above except
`EditScreen.tsx`, and it shares no cause with any of them.

It stays out of scope, and it needs its own change. The cost meanwhile stays
small and visible. A permanently dirty draft makes the publish dialog always
render its unsaved-changes sentence, and always save first. That wastes one
`PUT`. It does not give a wrong result, and it does not block this change.

## Tests

Every invariant that lands ships a test that rejects a violating input, as
CLAUDE.md requires. Five invariants land.

**The `canPublish` field reports the permission, never the role.** DB-backed,
in `test/http-studio.test.ts`. An actor holding `system:author` with no
scoped grant reads false. The same actor with a `publish` grant naming that
process reads true. An actor holding `system:publish` reads true. The
violating input is the first case: an authoring role alone must never read
true.

**A false `canPublish` never yields an enabled control.** Pure, in the
existing `packages/web/test/studio-draftToolbarState.test.ts`. It tests a new
`publishAvailability(record)` resolver in `screens/draftToolbarState.ts`. A
false input returns disabled with a reason key. No input returns enabled
unless the field reads true. That file already carries an `isDirty` block and
a long header comment. The new cases go beside them, and that comment stays.

**The next-version label never prints a non-number.** Same file, against
`nextVersionLabel(base)`. A null input returns `v1`. An input of 3 returns
`v4`. The violating input is null, which a naive increment renders as
`vNaN`.

**`DraftToolbar.tsx` raises no native prompt.** A source test in
`packages/web/test/studio-no-confirm.test.ts` takes the idiom
`boundaries.test.ts` already uses. It reads the file, matches a pattern, and
asserts nothing hits. It names `DraftToolbar.tsx` and `ProcessHeaderBar.tsx`
alone, so the seven out-of-scope sites keep passing. The violating input is
a regression that puts the native prompt back.

The pattern matches the call `confirm(`, and the test strips comments before
it runs. Prose in a comment must not fail it.

The literal `confirm(` appears in one comment, at `DraftToolbar.tsx:51`. Two
others say the word in prose. The publish doc comment at
`DraftToolbar.tsx:112` is one, and task 6.5 rewrites it. A
second comment at `ProcessHeaderBar.tsx:69` names a publish-success
confirmation. Task 6.6 rewrites the first, and the second stays. The same
rule sits in `boundaries.test.ts:58-61`, that a name in a comment is not a
definition.

**The rendered header states the gate and announces the failure.** A new
`packages/web/test/studio-processHeaderBar-publishGate.test.tsx`. It takes
the idiom `studio-processHeaderBar-findingFallback.test.tsx` already
established for this same component. That means `renderToStaticMarkup` over a
`<DraftContext.Provider>` with a hand-built value, never a live
`DraftProvider`.

Four properties matter. One render cannot reach all four.

- `aria-disabled="true"` on the Publish item
- the reason text
- the `aria-describedby` that points at that text by id
- `role="alert"` and the banner class on the failure region

The fourth comes off a `ProcessHeaderBar` render. The first three do not. The
Publish item sits inside the `⋮` menu panel. That panel renders behind the
component's own `menuOpen` state. A static render fires no click, and it
re-renders on no state change. So the panel emits no markup at all.

This package carries no DOM harness to click the trigger with. Adding one
would add a dependency the proposal rules out.

Task 9.8 therefore extracts the item into `PublishMenuItem`. It owns the
`role="group"` wrapper, the `aria-disabled` item, the reason line and the
`aria-describedby` that binds them. They belong together anyway. Split them
and the reason reaches nobody. The rendered DOM does not change, and
`ProcessHeaderBar` stays the only production caller.

The test renders that component directly for the first three properties. It
renders the header itself for the fourth.

The violating inputs are a `canPublish: false` render with no
`aria-disabled`, and an `actions.error` render that emits a `studio-error`
paragraph.

`development-toolchain`'s split rule sends this to an assertion, not to
`docs/browser-checks.md`. The repository already produced the failure. This
change names the file and the line recording it. Static markup can observe
all four, once the item is a component of its own.

One existing guard covers the rest. The publish route's own refusal
scenarios already reject every unauthorized caller. This change adds none.

The studio catalog carries English alone. Its `t()` takes no locale. The
parity test in `i18n-catalog-parity.test.ts` names four areas, and the studio
is not one of them. So the new keys land in `en` alone, and no parity guard
reads them. That file does read the studio catalog once, in a separate loop,
to assert that no value is blank.

The browser keeps what static markup cannot see: the dialog's focus trap, the
Escape key, and the backdrop. The platform supplies all three through
`showModal()`, and none appears in a rendered string. So
`docs/browser-checks.md` gains the publish path for those. The assertions
above carry the rendering.

## Two defects the critique found in what this change built

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" is the fixed term for this screen (ui-glossary.md:45). -->
The critique of the edit screen scored 21 of 40, up from 15. Two of its P1
findings sit on what this change built. Neither predates it. So both belong
here rather than in a follow-up.

### The checks rail contradicted the gate it could not see

The rail's all-clear box read "No open issues. This draft is ready to publish."
for every actor. One sentence, one catalog key, two facts fused into it. The
component received `validation` and nothing else. So the second half of that
sentence asserted a permission the rail had never read.

The gate this change built refuses the same act, in the kebab menu about 900px
away. A `demo-developer` account read a promise in the right rail. It read a
refusal in the menu. One screen, one moment.

The fix threads the loaded `canPublish` report into the rail and splits the
sentence. The validation verdict keeps its own key. The publish verdict takes
one of two new keys, chosen by the report.

| Key | Reads |
|---|---|
| `checksRail.allClear` | No open issues. |
| `checksRail.clearReadyToPublish` | This draft is ready to publish. |
| `checksRail.clearNeedsPublishPermission` | Publishing needs the publish permission for this process. |

Two keys rather than one interpolated sentence, because the design language
forbids assembling a sentence from fragments. Each sentence a person reads gets
one key.

A permitted actor reads exactly what the rail printed before this fix. The copy
was never wrong for them. It was wrong for everybody else.

The wording names the permission and not the role, which follows the rule the
unavailable Publish item already follows. A scoped grant and the global
`system:publish` role satisfy one gate. Naming the role would mislead an author
whose administrator means to grant the process instead.

The rail's own verdict does not move. The function `allChecksClear` decides
whether the box renders at all, and this change leaves it untouched. A
held-back check still keeps the box hidden.

So `studio-checks-rail`'s own requirement still holds word for word. Its
sentence "a clear draft is publishable" states a fact about the checks. This
one states a fact about the actor. The rail now keeps the two apart.

The rule lands in the `studio-publish` delta, beside the unavailable Publish
item. That capability owns what the studio offers when the actor may not
publish. The rail is one more place that offers it. Putting the rule in
`studio-checks-rail` would split one permission rule across two capabilities.
It would also make that capability read a field it does not own.

### Threading the report to four mounts

The rail renders in the three placements `ui-glossary.md` names, across four
mount sites. `canPublish` reaches all four as a required prop.

| Mount | Route |
|---|---|
| Beside the canvas, `EditScreen.tsx` | direct, from `EditorArea` |
| Docked in the multi-selection summary, `EditScreen.tsx` | direct, from `EditorArea` |
| Docked at the inspector's bottom edge, `StepsPanel.tsx` | one new prop on `StepsPanel` |
| The panels screen's own column, `PanelsScreen.tsx` | one new prop on `PanelsScreen` |

The panels-screen mount looked like the hard one, and is not. That screen
mounts from `EditorArea`, which already holds the folded `canPublish` value. So
it is one prop pass. It needs no second fetch and no second context.

This prop stays required, never optional. An optional prop would add a third
state the rail cannot name. Unknown is not refused. A default either way puts
the wrong sentence on the screen. Four call sites is a small price for a value
the rail must read rather than guess.

Context was the alternative. It does not fit. The provider `DraftProvider`
sits above `EditorArea`, and the folded value lives below it. A rail reading
the draft context would read a value that provider never holds.

### The discard dialog primed its destructive button

Neither dialog carried an `autoFocus`. So the browser's own dialog focusing
steps chose the first focusable descendant. In the discard dialog that is
Discard draft. The studio carries no undo, so a reflexive Enter destroyed the
draft the dialog exists to protect.

The fix puts the initial focus on Cancel, in both dialogs. Publishing is
irreversible too, since a published version can never change.

Three mechanisms carry that, because no one of them holds alone. The
`autoFocus` prop states the intent. It is also the property a rendered string
carries, so the test below can assert it. In the browser it is not an attribute
at all: React 19 skips it in `setProp` and calls `.focus()` from `commitMount`
instead. That focus lands before this component's passive effect runs.

The effect then calls `showModal()`, which reruns the platform's dialog focusing
steps. Those steps look for the `autofocus` ATTRIBUTE, find none, and fall back
to the first focusable descendant. So the effect focuses Cancel again, after
`showModal()`. That third call is the one that decides the live browser.

### Returning the focus the dialog took

Escape used to drop focus to the document body. The developer then restarted
their traversal from the top of the screen.

Both dialogs mount only while `actions.pendingDialog` names them. Every close
route clears that field: Cancel, Escape through `onCancel`, a backdrop
dismissal, and a request that finished. So every route unmounts the dialog, and
one effect cleanup covers all four with no per-route handler.

The cleanup focuses the kebab trigger, held in a ref on `ProcessHeaderBar` and
passed into both dialogs. A ref rather than a `document` query, since the
component that owns the trigger is the component that mounts the dialogs. A
detached node after a discard navigates away takes the call harmlessly.

Both dialogs shared their `showModal()` effect already. So the three additions
go into one `useConfirmDialog` hook rather than into each dialog twice.

The focus rule lands in the `studio-publish` dialog requirement. That
requirement already fixes the dialog's platform behavior, naming the focus trap,
the Escape key and the backdrop. And `studio-app`'s discard requirement already
defers to it: "The dialog SHALL take the treatment `studio-publish` fixes for
the publish dialog."

Splitting the rule across both would leave one dialog contract in two
capabilities. So the rule lands in `studio-publish`, and the `studio-app`
requirement gains one scenario of its own. That scenario names the destructive
control, which is the one control only the discard dialog has.

`spa-error-reporting` was the third candidate, and it is wrong. That capability
covers how a failure reports. Nothing failed here.

### Tests for the two fixes

The rail's publish verdict gets a new
`packages/web/test/studio-checksRail-publishVerdict.test.tsx`, on the same
`renderToStaticMarkup` idiom the header-bar tests use. The violating input is
the old sentence: a `canPublish: false` render still reading "ready to publish".
The existing `studio-checksRail.test.ts` stays where it is, since it carries the
pure grouping functions and holds no JSX.

The dialogs' initial focus gets four cases in
`studio-processHeaderBar-publishGate.test.tsx`. Each pulls every button open tag
out of the rendered string and asks which one carries `autofocus`. Exactly one
does, and it is the ghost-styled Cancel. The violating inputs are the
destructive button carrying it, and the primary Publish button carrying it.

The focus return gets no assertion. `development-toolchain`'s split rule sends
it to `docs/browser-checks.md`, beside the entry this change already wrote. A
rendered string carries no active element, and the platform decides where focus
lands after an unmount.

## Risks

A developer who could publish before still can. The `canPublish` field
reports the same predicate the route enforces. So the client gate and the
server gate cannot disagree.

A stale field is possible. An administrator can grant the permission while
the edit screen sits open. The developer reloads. The server never trusts
the field. So a stale false costs a reload, and a stale true costs a 403
that now renders properly.

The screen's own Reload button has to be that reload. Today `reload()`
re-reads the draft and folds back `revision` and `layout` alone
(`DraftToolbar.tsx:126-138`). A stale `canPublish` would survive the one
control the conflict banner offers. Only a full page load would clear it.

The field does not join `DraftSaveState`. That interface carries the
save/conflict machine alone, and `studio-draftSaveLogic.test.ts` pins its
exact shape with `toEqual`. A fourth key there breaks three assertions.

It follows `dockBaseVersion` instead. The `EditScreen` component passes the
loaded `canPublish` down as a prop. It already passes `loadedBaseVersion`
that way (`EditScreen.tsx:675`).

The `EditorArea` component holds the re-read value in its own `useState`, and
folds it over that prop. That is how `dockBaseVersion` folds `publishResult`
(`EditScreen.tsx:124`). The Versions screen already holds the neighbouring
`canPlanMigration` as component state (`VersionsScreen.tsx:46`), though it
folds no prop under it. The re-read
inside `reload()` supplies the fresh value, so `applyReload` keeps its
signature and its test.

## Migration Plan

No data migration. This change adds one computed field to a response body,
and it changes what one screen renders. Nothing persisted changes shape.

`GET /drafts/:processId` gains `canPublish`. The engine computes it per
request from `can(actor, "publish", processId, db)`. No column, no stored
row, and no published body carries it. A client that ignores the field keeps
working, so the engine half can land before the studio half.

No definition contract change, and no `definitionHash` input changes. An
instance pins nothing this change touches.

## Open Questions

The round-2 review raised four items. This change settles all four. The
`reload()` sizing sits above, and task 6.6 carries the `DraftToolbar.tsx:51`
header comment. Proposal.md's Impact now names the `app.css:2407` selector
list. The passage above corrects the two menu-item line numbers.

One question stays open. The studio carries a second publish control, and
this change does not gate it.

The promotion import publishes a supplied body through `publishProcess`
(`ProcessesScreen.tsx:280`). That route needs the same `system:publish` the
edit screen needs. The screen offers the control to any actor who reaches it.

This is not the failure the change fixes. A refusal there lands inside the
open dialog, and the developer reads it. That is the shape design.md adopts
for the edit screen. Only the prevention half stays absent.

Nobody has decided whether the promotion import gains the same `canPublish`
gate. It belongs to `environment-promotion`, not to `studio-publish`.
