## 1. Attachment upload bounds

- [ ] 1.1 Add a MIME-token pattern to `contentType` in `attachmentBodySchema`
      (`src/http/routes.ts`), keeping the existing length bound.
- [ ] 1.2 Replace the `Number(process.env.MAX_ATTACHMENT_BYTES ?? …)` read with
      a load-time parse that throws on a non-positive-integer value, following
      `parseRetentionDays` in `src/engine/host.ts`.
- [ ] 1.3 Add tests: a `contentType` holding a parameter, a CR or an LF is a
      400 `request-shape`; a valid type still uploads; a malformed
      `MAX_ATTACHMENT_BYTES` throws from the parse helper.

## 2. Attachment download headers

- [ ] 2.1 Add an optional `filename` to `HttpBinaryResult`
      (`src/http/errors.ts`). Only the download sets it, so `/metrics` keeps
      the shape it returns today.
- [ ] 2.2 Pass `filename` from `getAttachment` through `handleGetAttachment`
      into the binary result (`src/http/routes.ts`).
- [ ] 2.3 In `toBinaryResponse` (`src/http/server.ts`), send
      `X-Content-Type-Options: nosniff` on every binary response, and
      `Content-Disposition: attachment` with a percent-encoded filename only
      when the result carries one.
- [ ] 2.4 Add a test asserting both headers on a download whose stored
      `contentType` is `text/html`, and a test that a `/metrics` response
      carries `nosniff` and no `Content-Disposition`.

## 3. JSON envelope cache control

- [ ] 3.1 Add `Cache-Control: no-store` to `toResponse`
      (`src/http/server.ts`).
- [ ] 3.2 Add a test covering one success envelope and one error envelope.

## 4. Metrics endpoint gating

- [ ] 4.1 Read `METRICS_TOKEN` at server construction. Register the
      `/metrics` branch only when it holds a value.
- [ ] 4.2 Compare the request's bearer token against it in constant time.
      Answer `401` before any query on a missing or mismatched token.
- [ ] 4.3 Add tests: an authorized scrape returns the Prometheus body; an
      unauthorized one returns `401` and runs no query; an unset variable
      leaves the path to the unmatched-GET handling, which returns no metric
      line.

## 5. List limit clamp

- [ ] 5.1 Export `MAX_LIST_LIMIT` and `MAX_RECORD_LIMIT` from
      `src/runtime/api.ts`. Do not restate either value in the HTTP layer.
- [ ] 5.2 Give `parseLimit` (`src/http/routes.ts`) the caller's maximum from
      those exports and clamp to it. Leave the `Math.min` in
      `src/runtime/api.ts` in place, so both layers hold the bound.
- [ ] 5.3 Add a test that a `limit` above the maximum yields at most the
      maximum, asserted at the HTTP layer.

## 6. Documentation

- [ ] 6.1 Update `docs/openapi.yaml`: the download response headers, the
      upload's `contentType` format, and `/metrics` security.
- [ ] 6.2 Record `METRICS_TOKEN` and the stricter `MAX_ATTACHMENT_BYTES`
      wherever this repository lists deployment configuration.
- [ ] 6.3 Update `docs/current-state.md` where it describes the attachment
      routes and the metrics endpoint.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`.
- [ ] 7.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 7.3 Download an attachment in a real browser and confirm it saves
      instead of rendering.
