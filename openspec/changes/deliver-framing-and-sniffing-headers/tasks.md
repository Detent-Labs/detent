## 1. The engine's static branch

- [ ] 1.1 Add the four headers to `fileResponse` in `src/http/static.ts`,
      beside the `content-type` and `cache-control` it already sets.
- [ ] 1.2 Add tests to `test/http-static.test.ts`: a direct file hit, the
      `index.html` fallback and a navigation answer each carry all four; a
      `HEAD` answer carries them too.
- [ ] 1.3 Add a test that the wrapper's JSON envelope carries none of them.

## 2. The frontend image

- [ ] 2.1 Add four `add_header` directives with `always` to the server block
      in `docker/nginx.conf`.
- [ ] 2.2 Build the frontend image and confirm the headers on the shell, on a
      hashed asset, and on a 404.

## 3. The meta policy

- [ ] 3.1 Remove `frame-ancestors` from the directive list in
      `contentSecurityPolicy` (`packages/web/vite.config.ts`).
- [ ] 3.2 Update that function's doc comment: name the header that now
      carries the directive, and why a meta tag cannot.
- [ ] 3.3 Invert the assertion at `packages/web/test/vite-config.test.ts:40`.
      It requires `frame-ancestors 'none'` in the meta policy today, and
      must require its absence instead.

## 4. Documentation

- [ ] 4.1 Update `docs/current-state.md` where it describes static serving
      and the build-time CSP.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`.
- [ ] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 5.3 In a real browser, load an area from the engine and read the four
      headers off the document. Then load a page that puts that area in an
      `iframe` and confirm the browser refuses it.
