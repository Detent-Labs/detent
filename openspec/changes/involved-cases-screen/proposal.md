## Why

`instance-visibility-set` built the principal set and gave it a reader,
`GET /instances?scope=visible`. No screen calls it. A participant who
approved a case last week has no way to find it. My tasks drops it once the
step moves on, and Cases I started only answers for cases they raised
themselves.

## What Changes

- A fourth participant route, `/app/involved`, and the screen behind it. It
  lists `GET /instances?scope=visible` and sends no actor id of its own.
- The screen is the started screen's twin. Same row shape, same status stamp
  and tone, same date, same empty and failure wording, same load-more control.
  It reuses `startedLogic`, and adds no view model of its own.
- The nav offers it beside My tasks, Start a process and Cases I started.
- The app catalog gains the screen's own keys, in English and German.
- No engine change. The scope, its rule and its bound already ship.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `end-user-app`: a new requirement for the screen, and the routing
  requirement grows a fifth area route.

## Impact

- `packages/web/src/areas/app/routing.ts`: a fifth route.
- `packages/web/src/areas/app/root.tsx`: the nav entry and the screen mount.
- `packages/web/src/areas/app/screens/InvolvedScreen.tsx`: new.
- `packages/web/src/areas/app/api/client.ts`: the listing call.
- `packages/web/src/i18n/catalogs/app.ts`: the screen's keys, both locales.
- `packages/web/test/`: route, scope and rendering assertions.
- `docs/browser-checks.md`: a check beside "Cases I started".
- `docs/current-state.md`, `ROADMAP.md` and `tmp/offene-items.md`.
