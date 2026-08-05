## Context

The studio-app spec asks the studio to extract its testable logic from its
components. That convention is right where a decision has branches. Three
files apply it to an expression that has none.

`packages/web` has no interactive DOM test environment. Component tests render
through `react-dom/server`'s `renderToStaticMarkup`. That renderer fires no
event and re-renders on no state change. It is why the extracted-logic
convention exists. It is also why an extracted one-liner buys nothing: the
expression was never the part a test could not reach.

The two catalogs type themselves as `Record<UiLocale, Record<keyof typeof en,
string>>`. `tsconfig.json` does not set `noUncheckedIndexedAccess`, so
`catalog[locale][key]` is `string`, never `string | undefined`.

`shell.css` styles no `:invalid` or `:user-invalid` state anywhere.

## Goals / Non-Goals

**Goals:**

- Delete the wrappers that carry no logic, and keep the tests that cover the
  behavior underneath.
- One user-visible change: the login form states its required fields
  natively.
- No visual change, and no new CSS.

**Non-Goals:**

- No change to `waitingLabel`. See the rejected finding below.
- No change to any engine module, route or JSON definition.
- No new component, no new hook, no new module. This change only removes.
- No rename of `draftToolbarState.ts`. A rename costs four import changes and
  buys only a better name.

## Decisions

### `isDirty` moves into `draftToolbarState.ts`, and the file keeps its name

Both functions state one invariant: what the server last confirmed as
persisted. `savedBodyReducer` writes it and `isDirty` reads it. Splitting them
across two files put 9 lines of comment on one `JSON.stringify` comparison.

The audit offers `draft/dirty.ts` as the merged name. That name is better, and
it costs four import changes across `DraftToolbar.tsx` and three test files.
The existing name is already accurate for both, since both serve the draft
toolbar. The rename can ride along with whatever touches those imports next.

### The action union collapses to the `Draft` it carried

```ts
export function savedBodyReducer(_state: Draft, body: Draft): Draft {
  return structuredClone(body);
}
```

`useReducer` keeps working: its action type becomes `Draft`. The two call
sites go from `dispatchSavedBody({ kind: "saved", body })` to
`dispatchSavedBody(body)`.

The file's comment argued the two kinds stay distinct "so a reader tracing
either wiring path sees which one fired". Two call sites carry those names,
`doSave` and `reload`. They already say which one fired, and the reducer never
read the discriminant.

The `structuredClone` stays, and so does the comment explaining it. The panels
mutate the draft object in place. Storing the reference would make `savedBody`
follow every later change. It would turn the dirty gate permanently off. That is
the load-bearing part of the file.

### `selectVersion` inlines, and its two siblings stay

The expression is `{ ...selection, [which]: version }`, at two call sites,
both inside `VersionsScreen.tsx`. Its two siblings carry real work. `canDiff`
states that a version does not diff against itself, and `diffJson` walks the
two bodies. Both stay, and so does the `VersionSelection` type that `canDiff`
narrows.

The four `selectVersion` cases in `studio-versionDiffLogic.test.ts` fold into
the `canDiff` cases beside them, which already call it.

### The login form gates on `required`, not on a disabled button

```tsx
<input type="email" required ... />
<input type="password" required ... />
<button type="submit" disabled={loading}>
```

A disabled button states no reason. A person who left the password empty sees
a control that does nothing. A screen reader announces nothing about why.
`required` puts the browser's message beside the field and moves focus
there.

No CSS changes. `shell.css` styles no `:invalid` state, so an empty field
carries no error styling before the person submits. That was the one risk
worth checking before adding the attribute.

`type="email"` already validated its format in the browser. With `required` it
now also blocks an empty submission, which is the intent.

### The catalog fallback chain is unreachable, so it goes

`catalog[locale][key] ?? catalog.en[key] ?? key` becomes
`catalog[locale][key]`. The catalog type gives every locale every key by
construction, and the compiler is not set to doubt an index. A fallback that
cannot run reads as a hedge against a case the type already rules out.

### `nextRowId` keeps its name and loses its counter

```ts
export function nextRowId(): RowId {
  return `row_${crypto.randomUUID()}` as RowId;
}
```

The value is a React list key. The file's own comment says it never reaches
the plan. A module-level mutable counter shares one number across every screen
in the process, and `draft/ids.ts::mintId` already sets the convention. The
name stays, so the five call sites do not change.

### The rejected finding: `waitingLabel` and `Intl.RelativeTimeFormat`

The audit says `Intl.RelativeTimeFormat` covers `waitingLabel`'s buckets and
is already locale-aware. The second half is true and the first is not.

`waitingLabel` renders `"5m"`, `"3h"`, `"2d"` and `"just now"`. It is a
compact badge in the inbox's row. `Intl.RelativeTimeFormat` renders
`"5 minutes ago"` at its long style and `"5 min. ago"` at its narrow one. It
has no style that renders `"5m"`.

Adopting it would change what a participant reads. It would also drop four
catalog keys in two locales, and rewrite five tests that pin the current
strings. That is a redesign of the badge, and this change does not carry
one.

## Risks / Trade-offs

- **The login change is the only one a person can see.** It needs a browser.
  No test in this repo can substitute for one, and green tests do not see a
  validation bubble.
- **Deleting `freeText` deletes two test assertions.** Both assert the flag
  the same file sets. `ConditionBuilder.tsx`'s `ValueEditor` branches on
  `celType === "bool"`, then on `options?.length`. It never reads the flag.
  The surrounding test cases stay.
- **`crypto.randomUUID()` needs a secure context.** The engine serves the app
  from its own origin. The studio already depends on that call through
  `draft/ids.ts::mintId`, so this adds no constraint.
- **Removing the catalog fallback removes a runtime net.** It also removes the
  place a missing key could hide. A missing key is now a compile error, which
  is where a missing key belongs.

## Migration Plan

None. No stored data, no persisted definition, no HTTP contract. Every change
is inside the browser bundle.

Rollback is `git revert` of the single commit.

## Open Questions

None. The Decisions section answers finding 10 rather than deferring it.
