<!-- antislop: allow-file sentence-length em-dash -->

## 1. The static module

- [x] 1.1 Add `src/http/static.ts` exporting a function that takes the request
      and the web root and returns `Response | null`, declining with `null` for
      any method other than `GET` or `HEAD`.
- [x] 1.2 Percent-decode the request path, resolve it against the root with
      `node:path`, and decline unless the resolved path equals the root or
      starts with the root plus a path separator. Decline on a `URIError` from
      decoding.
- [x] 1.3 Serve an existing file with its content type and `Cache-Control:
      max-age=31536000, immutable`; serve `index.html` with `Cache-Control:
      no-cache`, both as the fallback for an unmatched path and for a direct
      request for `/index.html`.
- [x] 1.4 Treat anything that is not a regular file as absent, so a directory
      path falls through to `index.html` instead of raising.
- [x] 1.5 Return headers with an empty body for `HEAD`, and decline when the
      root holds no `index.html` and the path names no file.
- [x] 1.6 Add no CORS headers to any response this module builds.

## 2. Wiring

- [x] 2.1 Give `createServer` an optional web-root parameter and call the static
      module at the terminal 404 in `src/http/server.ts`, keeping today's JSON
      404 envelope when the module declines or the parameter is absent.
- [x] 2.2 In `startHttpServer`, resolve `WEB_ROOT` or default to
      `packages/web/dist` relative to `import.meta.dir`, check the directory
      exists, and pass the path or `undefined` to `createServer`.
- [x] 2.3 Treat a `WEB_ROOT` that names a non-directory the same as an absent
      one.
- [x] 2.4 Treat an empty or whitespace-only `WEB_ROOT` as unset, so it never
      resolves to the process working directory.

## 3. Documentation

- [x] 3.1 Add `src/http/static.ts` and `WEB_ROOT` to `docs/current-state.md`,
      next to the other `src/http/` entries and the other environment
      variables.
- [x] 3.2 Mark step 0 of ROADMAP.md item 12 as done, leaving steps 1 to 5 for
      `consolidate-frontend-shell`.

## 4. Tests

- [x] 4.1 Add a committed fixture root under `test/fixtures/web-root/` holding
      `index.html` and a hashed file under `assets/`.
- [x] 4.2 Add `test/http-static.test.ts` covering: an existing file served with
      its type and immutable cache header; `HEAD` with no body; the
      `index.html` fallback for an unmatched path with `no-cache`; a direct
      `/index.html` request with `no-cache`.
- [x] 4.3 Cover the containment boundary: `..`, its percent-encoded form
      (`%2e%2e%2f`), a double-encoded form, and a malformed escape (`%zz`). No
      response may carry bytes from outside the root.
- [x] 4.4 Cover the negative cases: a `POST` to an unmatched path keeps the JSON
      404; an absent root keeps the JSON 404 for every method; a root with no
      `index.html` keeps the JSON 404; an API route still wins over a
      same-named file.
- [x] 4.5 Assert a request for an existing file succeeds with no `Authorization`
      header while a JWT resolver is wired.
- [x] 4.6 Assert a served file carries no CORS header while the server runs in
      wildcard mode, with the JSON 404 from the same position as the control.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` in the devcontainer; it passes with no errors.
- [x] 5.2 Run the FULL `bun test` suite in the devcontainer with `DATABASE_URL`
      set, never a single-file rerun, and confirm the skip count is what a
      DB-backed run should show, not a silent skip of every DB suite.
