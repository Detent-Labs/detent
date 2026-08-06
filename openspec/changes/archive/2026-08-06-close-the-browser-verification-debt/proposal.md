## Why

`CLAUDE.md` requires a real browser for any UI change. It names three defects
that shipped past a green suite here. A dialog rendered behind a modal. A stale
result row. An `/admin/*` route collision.

On 2026-08-06 the repository merged and archived ten changes. Ten browser
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
  archive, because it is not part of a change. It states how a contributor
  finds their own address, and the rule that no test run may be in flight.
- `development-toolchain` gains the rule that decides which side a check lands
  on. The next UI change then does not re-argue it.
- Nine of the ten open tasks close. Five close by assertion, four by one run
  of the new checklist. The tenth, the immediate 401 after a disable, closed
  already: a live run confirmed it on 2026-08-06, and `design.md` records
  that verdict.

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
  or a checklist entry. It also states how a manual check finds its own
  address.
- `unified-shell`: an area's router ships match, round-trip and half-match
  coverage, the shape `admin-routing.test.ts` already has.
- `http-wrapper`: a declared ledger of routes that return stored bytes drives
  the disposition assertion, not one route. The percent-encoding requirement
  gains a scenario naming that ledger.
- `transactional-outbox`: a dispatch that a host allowlist refuses reaches the
  dead-letter list, and the message names the host.
- `studio-app`: the existing missing-translation warning gains a static rule
  enforcing it at every render site under `src/areas/studio/`.

## Impact

- `docs/browser-checks.md`: new. The manual checklist, four entries.
- `src/http/server.ts`: a new exported `BINARY_ROUTES` ledger, the declared
  list of routes that return stored bytes.
- `test/http-disposition.test.ts`: new. It drives `createServer`'s handler
  over `BINARY_ROUTES`, with no port, the way `test/http-static.test.ts`
  does. It needs the `_test` database, since a disposition case reads an
  uploaded attachment row.
- `test/outbox.test.ts`: one case for a refused host reaching the dead-letter
  list.
- `test/runtime-api.test.ts`: two cases closing the untested half of the
  existing `InstanceView.columns` requirement: an absent `view.columns`
  resolves to `1`, and a declared `columns: 2` survives.
- `packages/web/test/boundaries.test.ts`: one static rule, scoped to
  `src/areas/studio/`, for authored-text render sites.
- `packages/web/test/studio-routing.test.ts` and `routing.test.ts`: the
  shared-prefix and deeper-path cases each already lacks.
- `packages/web/test/reporting-routing.test.ts`: new. The match, round-trip
  and half-match shape `admin-routing.test.ts` already has.
- `.claude/skills/openspec-archive-change/SKILL.md`: an archive-time check
  refusing an unchecked browser task.
- `CLAUDE.md`: the browser bullet points at the checklist.
- `docs/current-state.md`: the verification entry.
