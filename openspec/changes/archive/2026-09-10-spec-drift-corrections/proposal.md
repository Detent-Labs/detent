## Why

Two living capability specs describe code this repository no longer holds.

The first is `http-api-documentation`. Its coverage requirement enumerates
the routes `docs/openapi.yaml` describes. That list runs four pairs short of
the document today. It also grants none of the three exclusions the document
already takes. Four served routes under `/instances/` stand in neither list.
A reader cannot tell whether their absence is a decision.

The second is `spa-accessibility`. Its disclosure requirement describes an
expandable step card in `StepsPanel`. The rail in `StepsRail.tsx` replaced
that card. Its rows are buttons that open a step page, and none of them
expands. The requirement's note and both of its scenarios still describe the
card.

A documentation audit found both gaps. Ten readers verified every claim
against the working tree and wrote the corrections to `tmp/doc-audit/`. This
change carries the two corrections that need a capability delta.

## What Changes

- Document `PUT /instances/{instanceId}/draft` and the three
  `/instances/{instanceId}/visibility/*` writes in `docs/openapi.yaml`, with
  the three component schemas those four entries reference.
- Name the draft save and the visibility change in the document's own summary
  sentence. That sentence today claims the full instance lifecycle.
- Rewrite the `http-api-documentation` coverage requirement. It absorbs the
  `templates/*` exclusion and the two studio version reads the document
  already excludes without a grant. It gains the four new routes, the three
  attachments pairs and `GET /metrics`.
- Extend `test/openapi-exclusions.test.ts`. Its `EXCLUDED` list gains
  `templates`, and new assertions cover the four documented paths. The full
  suite therefore becomes a real gate here, rather than a formality.
- Rewrite the `spa-accessibility` disclosure requirement's note and both of
  its scenarios, so the requirement stops describing a card no package
  renders. Its name gains one word, which the delta shape forces.
- Add one assertion to `packages/web/test/studio-stepsRail.test.tsx`: no rail
  row carries `aria-expanded`.
- Correct one comment in `packages/web/test/studio-stepPage.test.tsx`. It
  counts the step page's disclosures at one, and the page carries two.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-api-documentation`: the coverage requirement's route list and its
  exclusion list both change.
- `spa-accessibility`: the disclosure requirement leaves and returns, with a
  new note, two new scenarios and a one-word wider name.

## Impact

- Four tracked files outside `openspec/`: `docs/openapi.yaml`,
  `test/openapi-exclusions.test.ts`,
  `packages/web/test/studio-stepsRail.test.tsx` and
  `packages/web/test/studio-stepPage.test.tsx`.
- Two delta specs, one per modified capability.
- No file under `src/` changes. No engine, HTTP or UI behavior changes. Every
  route this change documents already runs today.
- The full `bun test` with `DATABASE_URL` set is a real gate here, because two
  test files gain an assertion.
