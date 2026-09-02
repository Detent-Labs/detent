## Context

The app area carries four routes and four screens of its own.
Those screens are `TasksScreen`, `TaskScreen`, `StartScreen` and
`StartedScreen`.
A pure matcher and path builder over a four-member `Route` union sits in
`routing.ts`.
The started screen's view model sits in `startedLogic.ts`: a status key, a
status tone and a date label.

`GET /instances?scope=visible` ships and has no caller in the browser. The
archived proposal of `instance-visibility-set` left the screen open.
It left one question with it: a third tab, or a filter on My tasks.

## Goals / Non-Goals

**Goals:**

- A participant finds a case they took part in.
- The screen reads like the one beside it, so nobody learns a second layout.
- No engine change and no second view model.

**Non-Goals:**

- A filter, a sort or a grouping control. The started screen carries none.
- A search box. Nothing in the area has one, and the bound is the same.
- Merging with My tasks. See the decision below.
- Any change to which instances the scope returns.

## Decisions

### A fourth route, not a tab on My tasks

The open question from `instance-visibility-set` gets the answer the area
already gives. Cases I started is its own route for the same reason.
The two lists answer two questions, and one of them is not an inbox.

My tasks carries a control bar that filters, sorts and groups. That bar
serves work awaiting somebody. A took-part list is a history, ordered
newest first, with no action pending. Folding it into the inbox would put a
finished case under a bar whose every control assumes live work.

`/app/started` is the precedent, and it settles the shape of the answer.

### The screen reuses `startedLogic`, and adds no module

`statusKey`, `statusTone` and `startedOnLabel` all apply unchanged. A row here
carries the same status stamp, the same four tones and the same date. A second
view model with the same three functions would be a copy waiting to drift.

Copying the file is the alternative. It buys a screen that can diverge later.
It costs one drift the tests would not catch, since each copy passes its own
assertions. Rejected.

The catalog namespace is the one thing the screen does not reuse.
`involved.*` keys sit beside `started.*`.
The heading, the empty state and the nav entry all differ.
A shared key would force one wording on two screens.

### The route word is `involved`

`/app/involved` names what the URL is about.
`/app/visible` would name the engine's scope, a wire word.
`/app/cases` would claim the whole noun.
Both other lists hold cases too.

The catalog carries the reader-facing wording. The heading reads "Cases I took
part in" and "Vorgänge, an denen ich beteiligt war".
The nav entry carries the same phrase.
German runs about 40 percent longer, so the browser check reads the nav row
for a wrap. The route word never reaches a person.

### The screen states an empty result and a failure differently

The started screen already separates them: words for an empty list, a stated
failure where the list would sit. Both are requirements there. This screen
repeats both rather than inventing a third state.

## Risks / Trade-offs

- **Two lists a participant might confuse.** Cases I started is a subset of
  this one. The nav wording separates them, and the browser check reads both
  in both locales.
- **The screen inherits the scope's bound.** A long history pages with the
  load-more control the started screen already carries.
- **A test instance never appears.** `scope=visible` excludes one by rule.
  That is deliberate and unchanged here.
- **The screen drops a row the engine cannot resolve, rather than degrading it.**
  `includeDegraded` stays off under `scope=visible`, as under `started` and
  `mine`. A page may therefore hold fewer than `limit` rows while the cursor
  still advances. The cost is one missing row, never a wrong one.
- **The row keeps the `.app-started-date` class.** The screens share one row
  shape, so they share its classes. The name says `started` and the class
  serves both. Renaming it would touch `app.css` and `StartedScreen.tsx` for
  no reader's benefit.

## Migration Plan

None. A new route, no stored state, no engine change. A participant sees a
fourth nav entry after the deploy.

## Open Questions

None that block. Whether the row should name why the participant reached the
case, as starter, claimant or candidate, is a later question. The engine
stores the principal but not the reason. Answering it needs a rule about what
a row may disclose, not a screen.

The took-part screen inherits one flaw from the started screen.
`usePagedList` starts with no items and no loading flag.
The first frame therefore renders the empty state before the request runs.
A fix belongs in both screens at once, not in the mirror alone.
