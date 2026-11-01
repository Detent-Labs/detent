# Design

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: discard, render, surface, failure and issue are glossary terms here, each naming its own thing. -->

## Context

`panels/ProcessHeaderBar.tsx` draws the bar. `screens/EditScreen.tsx` draws the
screen nav and the structural banner around it. `useDraftToolbarActions` stays as
it is. Change 15 replaces the save logic
with autosave, so this change keeps the Save command alive and small.

The bar must stay usable on every tab and over the JSON surface. The trailing
cluster keeps its auto-margin at every width.

## The shape brief (`/impeccable shape`)

The owner pre-approved the decisions, so the brief records its assumptions and
asks no question.

- **Job and audience.** A process author working a draft, mode Operate. They
  need three facts at a glance: which process, how the draft stands and what comes
  next.
- **Outcome.** Two rows stand above the tab row: the shared header, then the
  header bar. A clean draft's bar holds six things.
- **Direction.** The register language stays. The bar is one ruled row, flush
  left, with one filled action, which is Publish.
- **Sequence.** Back, name, state, then a gap, then Test, Publish and `⋮`. The
  eye reads where it is, then what is true, then what to do.
- **Scope.** The bar, the banner's place and words, Settings' Process view and
  the Publish dialog's facts. The tab row, the shared header and the Versions
  screen stay.
- **Anti-goals.** No machine chip, no second filled button, no toast, no new
  stamp tone and no motion.
- **States.** Clean, dirty, saving, just published, published long ago, never
  published, blocked, no permission and conflict. Also a non-base language, the
  JSON surface open and a long name.
- **Layout intent.** The row wraps as today, and the trailing cluster moves as
  one. A 40rem window stays usable but is not a target: the studio is a desktop
  tool by decision.

```text
← Processes  Expense approval  Saved at 10:32 · v1 published     Test [Publish] ⋮
← Processes  Expense approval  Unsaved changes · v1 published [Save]  Test [Publish] ⋮
← Processes  Expense approval  Saved · v2 published  Versions    Test [Publish] ⋮
```

## Goals / Non-Goals

**Goals:**

- A clean bar prints no key, no id, no revision, no hash and no locale code.
- Every command the bar held stays reachable in one or two presses.
- The studio tells an author who edits a second language that they do so.

**Non-Goals:**

- Autosave and "Saved just now": change 15.
- The discard dialog's facts and the shared dialog form: change 13.
- Rewording the publish findings list, which still prints references: recorded
  as HEADER-1.
- Moving Versions or the Player out of the menu: the owner rated M6 and M12
  "indifferent".

## Decisions

### D1. "Header bar" stays the word

The concept says "process bar". The glossary, specs and code say *header bar*.
One word per thing wins, and the row keeps its name. The term *screen nav* retires
with the row.

### D2. Save stands beside the state, only while dirty

The concept's row names no Save, because change 15 removes it. Until then an
author still needs it. Options:

| Option | Trade-off | Friction |
|---|---|---|
| Beside the state, only while dirty | Reads "Unsaved changes · v1 published [Save]"; change 15 deletes one element | Low |
| In the `⋮` menu | A hidden Save for two weeks, on the most frequent command | High |
| Always in the trailing cluster | The clean bar keeps a dead command, and the row stays crowded | Medium |

The first wins. A clean draft has nothing to save, so the bar stays calm. Save
reads `btn btn-secondary`, and "Saving…" while the request runs. It uses
`aria-disabled` and a press guard while saving, the pattern `PublishNavControl`
uses for its permission state. A native `disabled` would blur the focused button.

An answer can unmount the button that holds the focus. Focus then moves to the
state line (`tabIndex={-1}`) and stays out of the body. A ref set by the button's
press limits this to that case. Focus the author has moved since stays put.

### D3. The state line

One `role="status"` span prints the state, so a screen reader hears "Saved" when
the button vanishes. Save, the Versions offer and the Editing note stand after
the span as siblings, never inside it. Parts, in order:

- Dirty: "Unsaved changes" in the refusal tone, which `DESIGN.md` already names
  for this fact.
- Clean after a save in this session: "Saved at {time}", time from
  `toLocaleTimeString` with hour and minute. Prose, so no mono.
- Clean otherwise: "Saved".
- Then, where a published version exists, "{version} published". The version
  prints in mono, per the design language's rule for versions, and the sentence
  stays one catalog key.

`headerStateLine` in `screens/draftToolbarState.ts` picks the parts, so a test
reads them with no DOM. The version is `baseVersion`, which already folds a
fresh `publishResult.version` over the loaded one. A draft seeded from an older
version names that version. The sentence stays true of it, and the Versions
screen answers which is newest.

### D4. After a publish

`EditScreen` holds `justPublished`. A successful publish sets it. The first dirty
render clears it, during render, the way React's guidance for adjusting state
says. A later save cannot bring it back.

While it stands, the version line takes the ink tone and a ghost "Versions"
button follows it. No stamp and no toast. The confirmation is ink, as
`design-language.md` states. Focus returns to Publish, and the status role
announces the line.

The publish findings list moves out of the row, to a sibling under the bar.
A list in a wrapping flex row reads as one more badge.

### D5. Test

A `btn btn-secondary` control labelled "Test", ahead of Publish. It calls the same
`onPlayer` as the menu's entry, so the leave prompt holds. D2 of the concept keeps
the menu's "Player" entry beside it.

### D6. The menu and Discard draft

The panel holds two groups: Views as it stands, then Draft with one entry,
"Discard draft", in `btn btn-secondary btn-destructive` with a `Trash2` icon.
The destructive style already outlines in the accent.

The dialog's `triggerRef` becomes the menu trigger, because the entry unmounts
when the menu closes. Every close route lands there.

The panel's `zIndex` rises from 1 to 4, above the matrix's sticky headers at 2
and 3. A press on a destructive entry must reach that entry. This closes CHANGES-5,
once a sweep over the matrix at 1280 and over the Map tab at 400 wide confirms it.

### D7. The content-locale switcher moves to Settings

`ContentLocaleBadge` becomes `ContentLocaleSelect`. Its label reads "Language you
are editing". It stands on the Process view, between the base language and the
add-a-language control. Its options keep the gap counts.

A hidden mode needs a sign. The content locale can differ from a well-formed base
language while the JSON surface is shut. The bar then prints a ghost button beside
the state, "Editing German", which opens Settings on its Process view. A process
in one language never sees it. `Intl.DisplayNames` with `en` names the language,
since the studio catalog is English only. A code it cannot name prints as itself.

Options:

| Option | Trade-off | Friction |
|---|---|---|
| A note only outside the base language | One control in a rare state | Low |
| Nothing in the bar | An author types German into the wrong entry, unwarned | High |
| The old badge kept | A permanent locale code on every draft, which D8 rejected | Medium |

The JSON surface prints every language at once and reads no content locale. So
the switcher no longer stands over it, and the note hides there.

### D8. Where the machine values go

| Value | New home | Why |
|---|---|---|
| Key | Settings' Developer view (already), Publish dialog's Developer view | Principle 2 |
| Process id | Same | Principle 2 |
| Revision | Settings' Developer view, Publish dialog's Developer view | Principle 2 |
| Hash | Settings' Developer view after a publish; always on Versions | No hash exists before a publish |
| Next version | Stays a plain dialog fact | It says what the act does |

Reading the base version's hash on every surface open would add one request for a
value few authors read. The Versions screen already prints it.

The dialog's Developer view is a closed `<details>` under the facts, in the shape
the Settings tab uses. A draft in more than one language gains a "Languages" fact.
It lists each language with its gap count, through the switcher's own wording.

### D9. The banner

The structural banner moves below the bar, beside the failure banners. Its text
becomes one sentence with no engine word. It reads "Open Checks and fix this
draft's structure, so every check can run." It keeps `colors.refusal` and no stamp. The
failure and conflict banners keep their shape, because `spa-error-reporting` binds
it.

### D10. Composition

The bar gains two callbacks and one flag: `onBack`, `onOpenSettings` and
`justPublished`. A small `DraftStateLine` component in the same file draws the
state. The header's JSX stays a list of its parts, with no new context.

The back control stays a `<button>` because it passes through the leave guard.
Its accessible name reads "Back to processes", which holds the visible word.

One `leading` group holds back, name, warning, issue sentence, state, Save, the
note and the Versions offer. Its style reads `display: flex; flexWrap: wrap; flex:
1 1 0; minWidth: 0`. The cluster takes `flex: 0 1 auto` and keeps its auto-margin. The
leading group wraps inside itself, so a new control there moves no trailing control.

The name input takes `fieldSizing: "content"` with a `min(40ch, 100%)` cap. A short
name leaves no gap, and a long one keeps the commands on the row.

### D11. What the critique changed

The first critique scored the bar 21/40. Four of its points belong here. The
rest stay with the changes that own them, and `docs/decisions.md` records them.

- The name's missing translation warning moves below the bar. It stands only
  while an author translates, and in the row it grew the bar to three lines.
- While the name has no entry in the edited language, its placeholder reads the
  base-language name, in place of "(untitled process)".
- The name input takes an accessible name, "Process name".
- The Process view's language controls take the author's words. The select's
  options and the dialog's Languages fact read "German (de)". The add control gets
  a visible label. Its refusal becomes a sentence with an alert role.

## Risks / Trade-offs

- Save appears on the first keystroke. The `leading` group wraps inside itself, so
  no trailing control moves.
- Change 15 reworks more than Save. Autosave flips the state on every pause. It
  must drop the refusal tone for a transient dirty state and stop announcing each
  flip. It also deletes Save, its focus rule and that ADDED requirement.
  `headerStateLine` is the one place both changes meet.
- A locale switch now costs a tab change. The note gets back to it in one press,
  and the owner chose this in D8.
- A browser with no `fieldSizing` keeps the input's default width, which is
  today's behaviour.

## Migration Plan

None. The change touches presentation only, and no stored data moves.

## Open Questions

None. The owner pre-approved the decisions. D2 and D7 record the two this change
had to add. D8 narrows the hash's home from the concept's, for the reason its table
states.
