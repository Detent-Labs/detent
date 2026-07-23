## 1. HTTP wrapper CORS

- [x] 1.1 Add an `Access-Control-Allow-Origin: *` header to every response
      written by `src/http/server.ts` (success and error paths alike).
- [x] 1.2 Add `OPTIONS` handling for the three routes
      (`/processes/:processId/instances`, `/instances/:instanceId`,
      `/instances/:instanceId/submit`): respond `204` with
      `Access-Control-Allow-Origin`, `-Methods` (the route's method), and
      `-Headers: Content-Type`, without calling the underlying Runtime API
      Layer operation.
- [x] 1.3 Add a CORS/OPTIONS case to `test/http.test.ts`
      (`test.skipIf(!DATABASE_URL)`) asserting the header on a normal
      response and the `204` + headers on a preflight, for each route.

## 2. Player HTTP client

- [x] 2.1 Create `packages/editor/src/player/client.ts`: typed functions for
      `POST /processes/:processId/instances`, `GET /instances/:instanceId`,
      `POST /instances/:instanceId/submit`, parameterized by `serverUrl`.
- [x] 2.2 Map a non-2xx response to a typed client error mirroring
      `src/http/errors.ts`'s shapes: `{ type: "validation", issues }`,
      `{ type: "guard-refused", message }`,
      `{ type: "concurrency-conflict" }`, `{ type: "internal", message }`
      (network failures also map to `internal`).
- [x] 2.3 Write `packages/editor/test/player-client.test.ts` (matching the
      package's flat `test/` convention, not colocated under `src/`)
      mocking `globalThis.fetch`, asserting each route's request shape
      (method, URL, body) and each error-response-to-client-error mapping.

## 3. Player store

- [x] 3.1 Create `packages/editor/src/player/store.tsx`:
      `PlayerProvider`/`usePlayer` context+reducer, mirroring
      `draft/store.tsx`'s shape. State: `{ serverUrl, actorId, actorRoles,
      instanceId, view, loading, error }`.
- [x] 3.2 Implement actions `setServerUrl`, `setActor`,
      `createInstance(processId, version?, seedDataJson?)`,
      `openInstance(instanceId)`, `refresh()`, `submit(pathId, data)`.
- [x] 3.3 `createInstance` and `submit` ignore the mutation response body
      (beyond checking success) and always follow up with `GET
      /instances/:instanceId`, rendering that result as `view`.
- [x] 3.4 `submit` builds its `data` payload from only the current step's
      visible, non-readonly fields, keyed by `field.id`.
- [x] 3.5 Persist `serverUrl`/`actorId`/`actorRoles` to `localStorage` on
      change; read them on provider mount.
- [x] 3.6 Reject invalid seed-data JSON in `createInstance` before sending
      a request, surfacing a validation-shaped error.
- [x] 3.7 Write `packages/editor/test/player-store.test.ts` covering the
      create-then-refetch flow, the submit-then-refetch flow (including a
      submit that itself returns an `InstanceView`), and `localStorage`
      persistence of `serverUrl`/actor across a remount.

## 4. Field rendering

- [x] 4.1 Create `packages/editor/src/player/FieldInput.tsx` rendering one
      `ResolvedViewField` by `field.type`: `string`/`number`/`date`/
      `datetime` → native input; `boolean` → checkbox; `select`/
      `multiselect` → a `select` built from `field.options`; `group` → a
      nested `fieldset` housing fields whose `ResolvedViewField.group`
      matches its key.
- [x] 4.2 Render `reference`, `file`, any `Plugin` envelope type, and any
      field carrying `field.dataSource` (instead of `field.options`) as a
      free-text input; show an inline note on the `dataSource` case that
      data-source resolution is not yet supported.
- [x] 4.3 Disable the input when `readonly` is set; show a required marker
      when `required` is set (no client-side enforcement).
- [x] 4.4 Write `packages/editor/test/player-field-input-rendering.test.tsx`
      (following the existing `*-rendering.test.tsx` convention:
      `renderToStaticMarkup`, no jsdom) asserting each `BaseFieldType`
      renders its expected input, the `group` nesting, the required-marker
      display, and the `dataSource`/`reference`/`file`/`Plugin` free-text
      fallback.

## 5. Player screen

- [x] 5.1 Create `packages/editor/src/player/PlayerView.tsx`: connection
      bar (server URL, actor id, actor roles).
- [x] 5.2 Add the instance-access bar: "create new" (processId, optional
      version, optional raw-JSON seed data textarea) and "open existing"
      (paste an `instanceId`).
- [x] 5.3 Once an instance is loaded, render the step header (`step.key` /
      `step.label`), the field form via `FieldInput`, `availablePaths` as
      submit buttons (no button when the list is empty), a Refresh button,
      and error display per the error-mapping table (validation → per-field
      issues; guard-refused / concurrency-conflict / internal → their
      respective inline messages).

## 6. Wiring into the editor shell

- [x] 6.1 Add a local-state "Structure" / "Player" toggle to
      `packages/editor/src/App.tsx`, rendering the existing `Editor`
      component or `PlayerView`.
- [x] 6.2 Wrap only the Player side in `PlayerProvider`, independent of the
      existing `DraftProvider` — switching modes must not affect the open
      Draft.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm no errors.
- [x] 7.2 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun — the DB-backed suites share one database and
      contend when run back-to-back in isolation) and confirm a clean pass
      with no silently skipped DB suites.
