## 1. The engine's static branch

- [x] 1.1 Add the four headers to `fileResponse` in `src/http/static.ts`,
      beside the `content-type` and `cache-control` it already sets.
- [x] 1.2 Add tests to `test/http-static.test.ts`: a direct file hit, the
      `index.html` fallback and a navigation answer each carry all four; a
      `HEAD` answer carries them too.
- [x] 1.3 Add a test that the wrapper's JSON envelope carries none of them.

## 2. The frontend image

- [x] 2.1 Add four `add_header` directives with `always` to the server block
      in `docker/nginx.conf`. Comment the inheritance rule above them: nginx
      carries a level's `add_header` set into a nested block only while that
      block declares none of its own, so an `add_header` added later inside
      `location /` drops all four.
- [x] 2.2 Build the frontend image and confirm the headers on the shell, on a
      hashed asset, and on a non-2xx. `try_files $uri /index.html` answers
      every unmatched path with the shell, so the reachable non-2xx is the
      `405` a `POST` to a static path returns, not a `404`.

## 3. The meta policy

- [x] 3.1 Remove `frame-ancestors` from the directive list in
      `contentSecurityPolicy` (`packages/web/vite.config.ts`).
- [x] 3.2 Update that function's doc comment: name the header that now
      carries the directive, and why a meta tag cannot.
- [x] 3.3 Invert the assertion at `packages/web/test/vite-config.test.ts:40`.
      It requires `frame-ancestors 'none'` in the meta policy today, and
      must require its absence instead. Assert the absence of `report-uri`
      and `sandbox` beside it: a meta tag ignores all three, so one test
      covers the rule rather than the one directive this change removes.

## 4. Documentation

- [x] 4.1 Update `docs/current-state.md` where it describes static serving
      and the build-time CSP.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [ ] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 5.3 In a real browser, load an area from the engine and read the four
      headers off the document. Then load a page that puts that area in an
      `iframe` and confirm the browser refuses it. The framing page needs a
      second origin, so serve it from a second port rather than from the
      engine's own root.
