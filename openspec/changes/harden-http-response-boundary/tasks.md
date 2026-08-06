## 1. Attachment upload bounds

- [x] 1.1 Add a MIME-token pattern to `contentType` in `attachmentBodySchema`
      (`src/http/routes.ts`), keeping the existing length bound.
- [x] 1.2 Replace the `Number(process.env.MAX_ATTACHMENT_BYTES ?? …)` read with
      a load-time parse that throws on a non-positive-integer value, following
      `parseRetentionDays` in `src/engine/host.ts`. That function's doc comment
      names `MAX_ATTACHMENT_BYTES` as an env var that "falls back to a default
      on a bad value". This task makes that false, so it updates the comment in
      the same edit.
- [x] 1.3 Add tests in `test/http.test.ts`: a `contentType` holding a
      parameter, a CR or an LF is a 400 `request-shape`; a valid type still
      uploads; a malformed `MAX_ATTACHMENT_BYTES` throws from the parse helper.

## 2. Attachment download headers

- [x] 2.1 Add an optional `filename` to `HttpBinaryResult`
      (`src/http/errors.ts`). Only the download sets it, so `/metrics` keeps
      the shape it returns today.
- [x] 2.2 Pass `filename` from `getAttachment` through `handleGetAttachment`
      into the binary result (`src/http/routes.ts`).
- [x] 2.3 In `toBinaryResponse` (`src/http/server.ts`), send
      `X-Content-Type-Options: nosniff` on every binary response, and
      `Content-Disposition: attachment` with a percent-encoded filename only
      when the result carries one.
- [x] 2.4 Add a test in `test/http.test.ts` asserting both headers on a
      download whose stored `contentType` is `text/html`, and a test in
      `test/metrics.test.ts` that a `/metrics` response carries `nosniff` and
      no `Content-Disposition`.

## 3. JSON envelope cache control

- [x] 3.1 Add `Cache-Control: no-store` to `toResponse`
      (`src/http/server.ts`).
- [x] 3.2 Add a test in `test/http.test.ts` covering one success envelope and
      one error envelope.

## 4. Metrics endpoint gating

- [x] 4.1 Read `METRICS_TOKEN` at server construction. Register the
      `/metrics` branch only when it holds a value.
- [x] 4.2 Compare the request's bearer token against it in constant time.
      Answer `401` before any query on a missing or mismatched token. Check the
      two lengths first: `crypto.timingSafeEqual` raises a `RangeError` on
      buffers of different length, which is the common wrong-token case, and an
      unhandled raise turns the `401` into a `500`.
- [x] 4.3 Add tests in `test/metrics.test.ts`: an authorized scrape returns the
      Prometheus body; an unauthorized one returns `401` and runs no query; a
      token of the wrong length returns `401` and not `500`; an unset variable
      leaves the path to the unmatched-GET handling, which returns no metric
      line.
<!-- The quoted string is a test name this task must match verbatim, so the
     implementer can find the one test to rewrite. Rewording it here would
     send them looking for a name the suite does not hold. -->
<!-- antislop: allow passive-voice -->
- [x] 4.4 Rewrite `test/metrics.test.ts`'s "GET /metrics is unauthenticated,
      ignores CORS, and is not treated as a preflight". It asserts `200` for a
      token-less scrape, which this group turns into a `404`. Keep its CORS and
      preflight assertions, now behind a set `METRICS_TOKEN` and a scrape that
      carries it.

## 5. List limit clamp

- [x] 5.1 Export `MAX_LIST_LIMIT` and `MAX_RECORD_LIMIT` from
      `src/runtime/api.ts`, and `MAX_LIST_LIMIT` from
      `src/engine/admin-queries.ts`. Do not restate any of the three values in
      the HTTP layer.
- [x] 5.2 Give `parseLimit` (`src/http/routes.ts`) the caller's maximum as a
      second argument and clamp to it. Six call sites, and they do not all
      resolve against the same module. The four in `src/http/routes.ts` take
      the `src/runtime/api.ts` exports: `MAX_LIST_LIMIT` for the comment,
      attachment and instance lists, `MAX_RECORD_LIMIT` for the instance
      record. The two in `src/http/admin-routes.ts` feed `listOutbox` and
      `listPendingTimers`, which cap against `src/engine/admin-queries.ts`'s
      own `MAX_LIST_LIMIT`, so they take that export. The two constants hold
      the same number today by coincidence, not by contract, and importing
      either one across that boundary would bind the HTTP layer to the wrong
      module. Leave every `Math.min` in place, so both layers hold the bound.
- [x] 5.3 Add tests: `parseLimit` clamps a `limit` above its maximum, asserted
      directly; and one HTTP-layer test that a request carrying a `limit` far
      above the maximum still answers `200`.

## 6. Documentation

- [x] 6.1 Update `docs/openapi.yaml`: the download response headers, the
      upload's `contentType` format, and `/metrics` security. Two places carry
      the last one. The `/metrics` operation object holds its `security`, and
      the top-level `info.description` names `GET /metrics` among the routes an
      unauthenticated request may still reach.
- [x] 6.2 Record `METRICS_TOKEN` and the stricter `MAX_ATTACHMENT_BYTES` in
      `README.md`, whose engine-image paragraph lists the runtime environment
      variables, and in `docs/current-state.md`.
- [x] 6.3 Update `docs/current-state.md` where it describes the attachment
      routes and the metrics endpoint.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`.
- [ ] 7.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 7.3 Download an attachment in a real browser and confirm it saves
      instead of rendering.
