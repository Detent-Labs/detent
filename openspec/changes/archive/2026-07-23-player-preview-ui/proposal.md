## Why

Roadmap #5c ("make the engine reachable") has landed the Runtime API Layer
(#5a) and its HTTP wrapper (#5b), but nothing today lets a human drive a
running instance. The editor's existing graph view is explicitly read-only
and shows the FSM *shape*, not a running instance — there is no way to
create an instance, see its current step as a form, or submit a transition
without hand-rolling HTTP calls. A Player screen closes that gap and
end-to-end-validates the stack a real UI will eventually depend on.

## What Changes

- Add a new `packages/editor/src/player/` module: an HTTP client for the
  three Runtime API Layer routes, a `PlayerProvider`/`usePlayer`
  context+reducer store, a `PlayerView` screen (connection bar, create/open
  instance, step form, submit), and a `FieldInput` renderer covering every
  `BaseFieldType` plus the `Plugin`/`dataSource`/`reference`/`file`
  free-text fallback.
- Add a local-state "Structure" / "Player" toggle to `App.tsx`;
  `PlayerProvider` wraps only the Player side, independent of the existing
  `DraftProvider`.
- Persist `serverUrl`/`actorId`/`actorRoles` to `localStorage` so the Player
  doesn't need re-pointing or re-authenticating every session.
- **Modify `src/http/server.ts`**: add permissive CORS (`Access-Control-Allow-Origin: *`)
  and `OPTIONS` preflight handling on the three existing routes, so a
  browser `fetch` from the editor's Vite dev origin isn't blocked. No
  change to the three routes' request/response contracts.

Non-goals (see design.md for the full list and rationale): canvas editing,
real auth/assignment enforcement, an instance list/history view, push/
streaming updates, a structured seed-data form, and any editor-triggered
publish flow.

## Capabilities

### New Capabilities
- `editor-player`: a Player/preview screen in `packages/editor` that
  creates or opens a process instance over HTTP, renders its current step
  as a form from `getInstanceView`, and submits manual-path transitions via
  `submitAndTransition`.

### Modified Capabilities
- `http-wrapper`: add CORS response headers and `OPTIONS` preflight
  handling on the three existing routes, so a browser origin other than the
  server's own can call them. No change to existing route behavior.

## Impact

- **Affected code**: new `packages/editor/src/player/**`, a small addition
  to `packages/editor/src/App.tsx`, and a small CORS addition to
  `src/http/server.ts`.
- **Dependencies**: none added — native `fetch`, existing React/Vite/Bun
  toolchain.
- **Systems**: purely additive; no schema, engine, or existing-route
  behavior changes. Rollback is deleting the new directory, the `App.tsx`
  toggle, and the CORS lines.
