## Context

Roadmap #5c (`CLAUDE.md`, "Post-v1: make the engine reachable"): "a form
screen that drives a real instance through (b)" — (b) being the HTTP
wrapper around the Runtime API Layer, already built (`http-wrapper` spec).
Today nothing lets a human drive a running instance; the editor's existing
graph view is explicitly read-only and shows the FSM *shape*, not a running
instance.

This design adds a Player screen inside `packages/editor`: connect to a
running HTTP server, create or open an instance of an already-published
process, render its current step as a form from `getInstanceView`, and
submit manual-path transitions via `submitAndTransition` — driving a real
instance end-to-end through the browser.

## Goals / Non-Goals

**Goals:**
- Let a human create or open a process instance against a running HTTP
  server and drive it, one manual transition at a time, through a real
  browser form.
- Validate the full stack (schema → engine → Runtime API Layer → HTTP
  wrapper → editor) end-to-end with a real UI, not just a script.
- Cover every `BaseFieldType` with at least a usable (if minimal) input
  widget, so no published process is unplayable.

**Non-Goals:**
- **Canvas editing.** Unrelated pre-existing v1 exclusion, untouched here.
- **Real auth / assignment enforcement.** The HTTP layer trusts whatever
  `actor` it's given (Roadmap #5d, not yet built); the Player mirrors that —
  free-text actor id/roles, no login.
- **An instance list or history view.** The HTTP wrapper has no list
  endpoint (deliberate non-goal of that change); the Player only reaches an
  instance by creating one or by pasting a known `instanceId`.
- **Push/streaming updates.** The HTTP API is plain REST. The Player uses a
  manual Refresh button, not polling or a socket.
- **A structured seed-data form on creation.** Seed data is a raw JSON
  textarea, not a generated form — the field catalog isn't known until an
  instance/view exists.
- **Any editor-triggered publish flow.** Publishing a Draft to a server
  stays a separate, engine-side concern (e.g. a script calling
  `publishBody`), not a Player feature. The Player is decoupled from the
  open Draft entirely — it drives already-published processes on a running
  server, identified by `processId` (+ optional version).
- **A framework/router dependency.** `App.tsx` gains a plain local-state
  toggle between "Structure" and "Player" modes; no `react-router`.

## Decisions

### Module shape

New `packages/editor/src/player/` directory, parallel to `draft/`:

- **`client.ts`** — thin `fetch` wrapper for the HTTP wrapper's three
  routes (`POST /processes/:processId/instances`, `GET
  /instances/:instanceId`, `POST /instances/:instanceId/submit`). Maps a
  non-2xx response to a typed client error mirroring
  `src/http/errors.ts`'s shapes: `{ type: "validation", issues }`, `{ type:
  "guard-refused", message }`, `{ type: "concurrency-conflict" }`, `{ type:
  "internal", message }`.
- **`store.tsx`** — `PlayerProvider`/`usePlayer`, same context+reducer shape
  as `draft/store.tsx`. State: `{ serverUrl, actorId, actorRoles,
  instanceId, view, loading, error }`. `serverUrl`/`actorId`/`actorRoles`
  persist to `localStorage` (read on mount, written on change) — no rebuild
  needed to point at a different server, and the actor doesn't need
  re-entering every session. Actions: `setServerUrl`, `setActor`,
  `createInstance(processId, version?, seedDataJson?)`,
  `openInstance(instanceId)`, `refresh()`, `submit(pathId, data)`.
- **`PlayerView.tsx`** — the screen. Connection bar (server URL, actor id,
  actor roles). Instance-access bar: "create new" (processId, optional
  version, optional raw-JSON seed data) or "open existing" (paste an
  `instanceId`). Once an instance is loaded: step header (`step.key` /
  `step.label`), the field form, `availablePaths` as submit buttons, a
  Refresh button, and error display.
- **`FieldInput.tsx`** — renders one `ResolvedViewField` by `field.type`
  (`BaseFieldType`: `string | number | boolean | date | datetime | select |
  multiselect | reference | file | group`, or a `Plugin` envelope):
  `string`/`number`/`date`/`datetime` → native `input` (text/number/date/
  datetime-local), `boolean` → checkbox, `select`/`multiselect` → a
  `select` built from `field.options` when present, `group` → a nested
  `fieldset` housing the fields that carry its key in
  `ResolvedViewField.group`. `reference`/`file` and any `Plugin` type have
  no dedicated widget (a reference picker or file upload is out of scope
  for a preview tool) and render as free text, same fallback as the
  `dataSource` case below. A field carrying `field.dataSource` instead of
  `field.options` (meaningful only for `select`/`multiselect`/`reference`)
  renders as free-text input with an inline note ("data source resolution
  not yet supported — enter a raw value"), matching that runtime option
  resolution is explicitly unbuilt (`CLAUDE.md`, "Decided, not yet built").
  A field's `readonly` disables its input; `required` is shown as a marker,
  enforced server-side by `submitAndTransition`, not client-side.

`App.tsx` adds one local-state toggle rendering either the existing
`Editor` component or `PlayerView`; `PlayerProvider` wraps only the Player
side, independent of `DraftProvider`.

**Alternatives considered**: driving the Player state through the existing
`draft/store.tsx` reducer was rejected — the Draft model represents an
authored-but-unpublished definition, while the Player drives an already-
published, already-running instance; conflating the two states would make
neither reducer's invariants sound. A `react-router`-based route for
`/player` was rejected per the non-goals — one boolean toggle is the
entire navigation surface this screen needs.

### Data flow

`createInstance` and `submit` both return an `Instance`, not an
`InstanceView` (per the HTTP wrapper's route table) — except
`submit`'s `AutomaticCascadeLoop` case, which the HTTP layer itself
special-cases to return a `200` with an `InstanceView` already. Rather than
branch on which shape came back, the Player **ignores the mutation response
body** (beyond checking success) and always issues a follow-up `GET
/instances/:instanceId` afterward. One extra HTTP round trip; in exchange
the client has exactly one code path for "instance changed, re-render its
view" regardless of which call triggered the change.

Submitting sends only the current step's visible-and-editable
(`!readonly`) fields, keyed by `field.id`, matching the field-set boundary
`submitAndTransition` enforces server-side.

No polling. A manual **Refresh** button re-fetches `getInstanceView` on
demand — the only way to observe an async settle (an outbox-delivered
action, a fired timer) that happens after the initiating call already
returned, since the HTTP API has no push mechanism.

### Error handling

| Client error | Display |
|---|---|
| `validation` (422, `SubmissionValidationError`) | Per-field issue list, matched to `FieldInput`s by `fieldId` where possible, listed generically otherwise |
| `guard-refused` (409) | Inline message: the selected path is no longer available; suggests Refresh |
| `concurrency-conflict` (409) | Inline message: the instance changed concurrently; suggests Refresh and retry |
| `internal` (500, incl. network failure) | Raw error message shown as-is |

### CORS (server-side addition)

`src/http/server.ts` currently sends no CORS headers — the HTTP wrapper
design doc named this a known gap for exactly this change. Without it, a
browser `fetch` from the editor's Vite dev server (a different
origin/port) is blocked outright. This change adds the minimum needed:

- `Access-Control-Allow-Origin: *` on every response (dev-only tool, no
  credentials involved — `actor` is a plain JSON field, not a cookie/auth
  header).
- `OPTIONS` preflight handling for the three routes, returning `204` with
  `Access-Control-Allow-Methods`/`-Headers`.

No origin allowlist or config surface — matches the wrapper's own stance of
staying minimal until a concrete need (here: any browser origin, since this
is a local dev/preview tool) demands more.

### Testing

Tests live in the package's existing flat `packages/editor/test/` directory
(not colocated under `src/`), matching current file names like
`draft-store-reducer.test.ts` and `graph-view-rendering.test.tsx`:
`test/player-client.test.ts` mocks `globalThis.fetch` and asserts each
route's request shape and each error mapping. `test/player-field-input-rendering.test.tsx`
follows the existing `*-rendering.test.tsx` convention (`react-dom/server`'s
`renderToStaticMarkup`, no jsdom/testing-library, `bun:test`'s
`mock.module`/`mock()`) and asserts each `BaseFieldType` renders its
expected input, including the `group` nesting and the
`dataSource`/`reference`/`file`/`Plugin` free-text fallback.
`test/player-store.test.ts` covers the create-or-submit-then-refetch flow
and `localStorage` persistence of `serverUrl`/actor. `test/http.test.ts`
(the engine package's own test suite, not the editor's) gains a small
addition asserting the new CORS headers and `OPTIONS` handling — DB-backed
like the rest of that suite, `test.skipIf(!DATABASE_URL)`.

## Risks / Trade-offs

- **[Trade-off]** `Access-Control-Allow-Origin: *` is maximally permissive.
  Accepted because there's no credentialed request to protect (actor is a
  plain body/query field, not a cookie) and this targets local/dev use;
  revisit if the HTTP wrapper ever gains real auth (#5d).
- **[Trade-off]** No structured seed-data form on create — a raw JSON
  textarea. Accepted: building a generated form pre-instance would need
  fetching the field catalog through some other channel the HTTP wrapper
  doesn't expose (no "get process schema" route exists).
- **[Trade-off]** Manual refresh only, no live updates. Accepted per the
  brainstorming discussion — this is a preview/dev tool, not a production
  player; polling's added lifecycle complexity isn't justified yet.

## Migration Plan

Purely additive: a new `packages/editor/src/player/` directory, one small
`App.tsx` toggle, and a small CORS addition to the existing
`src/http/server.ts` (no route/behavior changes to the three existing
routes). Rollback is deleting the new directory, the toggle, and the CORS
lines.

## Open Questions

None outstanding — scope, navigation, instance access, server config, live
updates, `dataSource` field handling, and CORS were each resolved during
brainstorming (see decisions above).
