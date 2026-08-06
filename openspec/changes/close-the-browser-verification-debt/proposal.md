## Why

`CLAUDE.md` requires a real browser for any UI change. It names three defects
that shipped past a green suite here. A dialog rendered behind a modal. A stale
result row. An `/admin/*` route collision.

On 2026-08-06 the repository merged and archived ten changes. Nine browser
tasks stayed unchecked, spread over seven of them. They now sit under
`openspec/changes/archive/2026-08-06-*/tasks.md`. Nobody reads them there
again. One of them says why it stayed open: "no dev server port reaches this
worktree."

That is the pattern this change targets. The browser checklist lives inside a
change. The change gets archived. The checklist goes with it. The next UI
change writes a fresh list. The debt grows by whatever that list leaves undone.

A live run on 2026-08-06 already paid part of the debt. It confirmed the four
security headers on every serving path, and the token gate on `/metrics`. It
confirmed the immediate 401 after an operator disables an account. It confirmed
the pre-login wording override and its fallback. It confirmed the core of the
studio modal. Those need no plan.

The rest divides into two kinds, and the kinds want different treatment.

Some of those checks repeat on every UI change. A route table gains a route. A
serving path returns a file. A stored body meets a renderer that changed under
it. Each of those has a defect record here.

A `bun:test` assertion catches all four. It costs milliseconds, and every push
runs it already.

The rest holds a browser vendor's own behavior, or a pointer gesture. Chrome
refusing an `iframe` is Chrome's property, not this tree's. A drag that loses
its race with a native down-handler needs a real event loop. The Panzoom
`panzoom-exclude` finding is the precedent (`docs/current-state.md:1270`).
Those stay manual, in a file that outlives the change.

One constraint frames every option. `packages/editor` carried a Playwright
setup. Its deletion removed Playwright from the devcontainer's
`postCreateCommand` on purpose. `CLAUDE.md` also records that a running HTTP
server corrupts test runs. Three red runs of twenty with a dev server up, zero
of twenty with none. A headless browser suite would bring both costs back. This
change adds neither.

## What Changes

- Five suite assertions replace five of the open browser checks. Each one names
  the defect it catches. None of them starts a listening socket. So none of
  them can contend with the suite the way a dev server does.
- A new `docs/browser-checks.md` holds what stays manual. It survives the
  archive, because it is not part of a change. It states the port, the address,
  and the rule that no test run may be in flight.
- `development-toolchain` gains the rule that decides which side a check lands
  on. The next UI change then does not re-argue it.
- The nine open tasks close. Five close by assertion, four by one run of the
  new checklist.

Out of scope, and named so the reason survives. This change adds no browser
automation and no gate. `openspec/changes/archive/*gate-recurring-defects*`
already declined the stale-UI class on the record. Catching it needs a browser,
and `CLAUDE.md` already requires one. Nothing here reverses that. It narrows
what the browser still has to carry.

Also out of scope: two unchecked tasks that no browser touches. The white-label
change left `bun test packages/web/test/boundaries.test.ts` unrun. Its
verification group runs the whole suite anyway. The form-editor change left its
design-skill task unrun. That task describes work which already shipped.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: a rule that splits a browser check into an assertion
  or a checklist entry. It also fixes the port and address a manual check uses.
- `http-wrapper`: every route that returns stored bytes declares its
  disposition. The route table drives the assertion, not one route.
- `transactional-outbox`: a dispatch that a host allowlist refuses reaches the
  dead-letter list, and the message names the host.
- `form-ui`: a stored body that declares no layout renders the way it rendered
  before the layout keys existed.
- `authored-content-localization`: an area renders authored text through the
  localized-text helper, so a missing translation always warns.

## Impact

- `docs/browser-checks.md`: new. The manual checklist, four entries.
- `test/http-disposition.test.ts`: new. It drives `createServer`'s handler over
  the route table, with no port, the way `test/http-static.test.ts` does.
- `test/outbox.test.ts`: one case for a refused host reaching the dead-letter
  list.
- `packages/form-ui/test/`: new. `effectiveSpan` against a body with no
  `columns` key.
- `packages/web/test/boundaries.test.ts`: one static rule for authored-text
  render sites.
- `packages/web/test/studio-routing.test.ts` and `routing.test.ts`: the match,
  round-trip and no-half-match shape `admin-routing.test.ts` already has.
- `CLAUDE.md`: the browser bullet points at the checklist.
- `docs/current-state.md`: the verification entry.
