## Why

`VERSION` at the repo root already tracks `Major.Minor.Revision.BuildHash`
for every commit, but nothing in `packages/web` reads it. An operator or a
participant reporting a bug today has no way to say which build they are
on. They would have to ask someone to check the server. The account menu
already holds the other actor-independent facts, language and the area
switcher; the build identifier belongs beside them.

## What Changes

- Read the `VERSION` file at `packages/web` build time. Inline it as a
  build-time constant, so the running bundle always carries its own
  version string.
- Render that string in full: `Major.Minor.Revision.BuildHash`, e.g.
  `0.2.33.cd86cdb7`. It sits as a bare mono-face line inside the account
  menu, below the Logout entry. A hairline rule separates it, the same
  rule the menu already uses between groups.
- The line carries no label and no `role="menuitem"`. It is inert
  metadata, not an action. It sits outside the menu's interactive
  semantics even though it renders inside the same popup.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-shell`: the account menu gains a build-version line, sourced
  from the `VERSION` file at build time. It shows unconditionally for
  every signed-in actor. This is additive to the menu's existing content
  (Profile entry, language picker, area switcher, Logout). It changes no
  existing requirement's behavior.

## Impact

- `packages/web/vite.config.ts`: reads `VERSION` at config-evaluation time
  and adds a `define` entry inlining it as a constant.
- A new ambient `.d.ts` declaration for that constant, so `tsc --noEmit`
  resolves it.
- `packages/web/src/shell/Chrome.tsx`: renders the constant as a footer
  line in the account menu.
- `packages/web/src/shell/shell.css`: one new rule for the footer line
  (mono face, hairline separator), following the `shell-menu-*` naming
  already in use.
- No engine, schema, API, or i18n-catalog change. No new dependency.
