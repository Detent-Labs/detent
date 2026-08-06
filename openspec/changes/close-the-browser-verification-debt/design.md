## Context

`CLAUDE.md` requires a real browser for any UI change. The rule earned its
place. Three defects shipped past a green suite here, and only a browser would
have caught them.

The rule has no owner between changes. Each change writes its own browser
tasks. The archive swallows them when the change closes. On 2026-08-06 that
left nine unchecked tasks across seven archived changes.

Two facts bound every option here.

`packages/editor` carried a Playwright setup. Deleting that package removed
Playwright from the devcontainer's `postCreateCommand` on purpose
(`docs/current-state.md:1546`). Bringing it back costs an install on every
container build, for a package tree that no longer needs it.

A running HTTP server corrupts test runs. `CLAUDE.md` records the measurement.
Three red runs of twenty with a dev server up. Zero of twenty with none. The
outbox poller claims rows the suite is driving. A browser suite needs a server,
so it cannot share a run with `bun test`.

`openspec/changes/archive/*gate-recurring-defects*/design.md` already declined
the stale-UI class as a gate. Its reason still holds. Catching it needs a
browser, and the browser rule exists.

## Goals / Non-Goals

**Goals:**

- Every open browser task from 2026-08-06 gets a verdict: assertion or
  checklist.
- Each assertion names a defect this repository already produced.
- No assertion opens a listening socket, so the dev-server hazard stays closed.
- What stays manual lives in a file outside any change, so the archive cannot
  swallow it again.

**Non-Goals:**

- A headless browser suite. Two costs block it: the Playwright install a prior
  change removed, and the running server that corrupts `bun test`.
- A push gate for UI state. The gate change declined that class on the record,
  and nothing here changes the evidence.
- Coverage of pointer gestures. `packages/web` does not unit-test pointer
  wiring, by an existing convention that `studio-canvas` states.
- Repairing the archived task files. The archive holds them now. The checklist
  replaces them.

## Decisions

### The split rule: a defect record decides

A browser check becomes a suite assertion when two things hold. This
repository already produced the defect it catches. And a `bun:test` assertion
can observe the property without a browser.

Otherwise the check stays manual. That covers a browser vendor's own behavior,
a pointer gesture, and a visual judgment.

The rule is deliberately narrow. It rejects an assertion written for a defect
nobody has seen here.

### Where each open task lands

| Archived task | Verdict | Reason |
|---|---|---|
| framing 5.3, `iframe` from a second origin | manual, once | `test/http-static.test.ts` already asserts the four headers. The browser adds Chrome's honoring of `frame-ancestors`, which is Chrome's property. |
| boundary 7.3, attachment download | split | The header comes from `src/http/server.ts:173`. A later binary route can forget it, so the route table drives an assertion. The save behavior stays manual. |
| egress 4.3, dead-letter row after a refused host | assertion | The path runs from dispatch to `listOutbox`. Every step is server-side. |
| translation 5.5 and modal 6.5, six locale warnings | split | A static rule finds a seventh render site. Whether a badge reads well stays a human judgment. |
| form editor 8.3, two-column layout in Player and Task | assertion | Both screens render `FieldForm`. One `effectiveSpan` case covers both. |
| form editor 8.3, drag and drop, keyboard reorder | manual | Pointer event ordering. The Panzoom race is the precedent. |
| form editor 8.4, a definition published before the change | assertion | `columns` is optional. A body without it must resolve to one column. |
| modal 6.3 and 6.4, the rest of the list | manual | Stacking, focus return, backdrop, and discarding nothing. One component. |

### The five assertions, and the defect each one names

**Disposition over the route table**. `src/http/server.ts:173` sets
`Content-Disposition: attachment` on a result that carries a filename. One
route does. A new binary route can skip it, and a browser then renders stored
bytes inline. The defect class is route-table drift, which the `/admin/*`
collision already demonstrated. The assertion walks the route table rather than
one route, so a new route arrives covered.

**A refused host reaches the dead-letter list**. The egress allowlist rejects a
host. The dispatch must land in the dead-letter list, and the message must name
the host. An operator who cannot see the host cannot repair the allowlist. No
step of that path needs a browser.

**A body with no layout keys**. Such a body must render as it did before.
The form-editor change added `view.columns` and `viewField.span`.
`test/view-layout-hash.test.ts` already pins the hash against both keys.
Nothing pins the render. `effectiveSpan` is pure and exported, so one case
pins it.

**An authored-text site routes through the localized-text helper**. The modal
task enumerated six warning sites by hand. A seventh site added later warns
about nothing, and a missing translation then ships silently. A static rule in
the `boundaries.test.ts` style finds it.

**A router refuses a half-match**. It also matches and round-trips.
`admin-routing.test.ts` already has that shape. `CLAUDE.md` names the
`/admin/*` collision as one of the three real defects. The studio and app
routers carry no such coverage.

### The assertions start no server

`test/http-static.test.ts` shows the shape. It calls `createServer`'s handler
directly. No port, and for most cases no database. The disposition assertion
copies it.

The dead-letter assertion drives the engine in process, against the `_test`
database that `test/preload-db.ts` provisions. `test/outbox.test.ts` already
works that way.

The three frontend assertions are pure. They read source files or call exported
functions.

So nothing this change adds listens on a socket. The measured hazard stays
where it is.

### The checklist is a document, not a change artifact

`docs/browser-checks.md` holds the four manual entries. It sits outside
`openspec/`, so no archive step moves it.

Each entry states what to open, what to do, and what a pass looks like. Each
one names the change that first asked for it, so its origin survives.

The file opens with the operating rules. Use `http://127.0.0.1:3001`, not
`localhost`. Under Windows `localhost` resolves to `::1` and the connection
hangs. `.devcontainer/docker-compose.override.yml` publishes `3001:3000`, and
the engine serves the bundle from `WEB_ROOT`.

The second rule: run no `bun test` while a dev server answers that port. The
poller and the suite fight over outbox rows.

### `playwright-cli` drives the manual run, and stays off the dependency list

The host already has `playwright-cli`, and `.claude/settings.json` allows its
read-only subcommands. An agent uses it to walk the checklist.

That is a tool on the machine, not a dependency of the repository. No manifest
gains an entry. No container build gains an install. A contributor with no
`playwright-cli` opens a normal browser and reads the same checklist.

## Risks / Trade-offs

- The checklist becomes a file nobody opens. Mitigation: `CLAUDE.md`'s browser
  bullet points at it, and a UI change's verification group names it.
- A static rule over render sites can flag a site that needs no warning.
  Mitigation: the rule ships green. An exempt site carries an inline comment
  saying why, the way the antislop directives work.
- Five assertions are five more things to maintain. Three of them are pure
  function calls. The other two follow shapes the suite already has.
- The manual entries still depend on somebody running them. This change does
  not fix that. It fixes the part where the list disappears.
- The split rule needs judgment about what counts as a defect record. A
  contributor may read it loosely. Mitigation: the rule asks for the file and
  the line that records the defect.

## Migration Plan

No migration. The assertions land green on the tree that adds them, the way
`push-gate-checks` requires of a gate.

`docs/browser-checks.md` starts with the four open entries. Their first run
closes the 2026-08-06 debt. The entries stay, because the checks repeat
whenever their component changes.

Rollback is a revert. The checklist is inert without somebody reading it, and
the assertions are ordinary tests.

## Open Questions

None.
