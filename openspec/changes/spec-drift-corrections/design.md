## Context

See `proposal.md` for motivation. Five facts fix the shape of this change.

A documentation audit drove this effort. Ten readers verified every finding
against the working tree and wrote byte-exact correction reports to
`tmp/doc-audit/`. A completeness critic reviewed all ten and wrote
`tmp/doc-audit/00-critique.md`. Twenty-five audit claims failed verification.
A report therefore outranks the audit wherever the two disagree, and the
critique outranks a report it corrected.

This change carries two of those reports: `09-openapi.md` in full, and C11 of
`07-readme-product-design.md`. Sibling changes in the same effort carry the
other eight. The byte-exact anchors stay in the reports, which the implementer
reads. This document carries the facts, so the archived change stays readable
once `tmp/` is gone.

The HTTP wrapper serves 89 routes. The OpenAPI document describes 24
method-and-path pairs. Sixty-one of the remaining 65 fall under an exclusion
the document names. Four do not. The draft save at `src/http/server.ts:581`
is one. The three visibility writes at `:603`, `:605` and `:607` are the rest.

The drift runs both ways. The document already excludes `templates/*` and the
two `processes/{processId}/versions/{version}` studio reads
(`docs/openapi.yaml:10-13`), and the live requirement grants neither exclusion
(`openspec/specs/http-api-documentation/spec.md:30-31`). The document also
already carries the three attachments pairs and `GET /metrics`, which the same
requirement's route list omits (`docs/openapi.yaml:649`, `:711`, `:755` and
`:1051`, against `:23-30` of the spec).

The `StepsPanel` component is gone. Three live specs still name it. A rename
fixes two of them, `studio-canvas:102` and
`authored-content-localization:127`, and a sibling change owns both. The third
is no rename. The note at `spa-accessibility:66` and the two scenarios at
`:71-75` and `:77-80` describe a card that expands. The rail's rows select
instead.

## Goals / Non-Goals

**Goals:**
- Document the four served `/instances/` routes that no exclusion covers, with
  the schemas their entries reference.
- Make the `http-api-documentation` coverage requirement match the document it
  governs, in both directions.
- Make the `spa-accessibility` disclosure requirement describe the steps
  surface as it stands.
- Let the exclusions test enforce the widened exclusion list and the four new
  paths. That check stops this drift returning in silence.

**Non-Goals:**
- No `http-wrapper` requirement for the three visibility routes. That gap is
  real, and this change records it below rather than closing it.
- No change to the disclosure requirement's SHALL sentence. Four components
  carry a disclosure with `aria-expanded` and no `aria-controls`, which that
  sentence demands. Closing that gap needs its own change.
- No documentation of `admin/*`, `drafts/*`, `migration-plans/*`,
  `reporting/*`, `templates/*`, `registry` or the two studio version reads.
  The owner decided the spec absorbs those exclusions instead.
- No file under `src/` changes. Every route this change documents already
  runs.
- No file under `packages/web/src/` changes either. No screen changes, so the
  browser check a UI change demands does not apply here.
- No `StepsPanel` rename in `studio-canvas` or in
  `authored-content-localization`. A sibling change owns those two.

## Decisions

### Correction list: the OpenAPI document

| Where | Today | After this change | Evidence |
|---|---|---|---|
| `paths`, above `/instances/{instanceId}/claim` | no entry | a `put:` entry, `saveInstanceDraft`, with 200, 400, 401, 403, 409 and 500 | route `src/http/server.ts:581`; body `src/http/routes.ts:118-120`; authority `src/runtime/api.ts:1294-1302` |
| `paths`, above `/account/me` | no entry | three `post:` entries, `grantInstanceVisibility`, `revokeInstanceVisibility` and `restoreInstanceVisibility`, each with 204, 400, 401, 403 and 500 | routes `src/http/server.ts:603`, `:605`, `:607`; gate `src/runtime/api.ts:2482-2484`; event `:2501-2509` |
| `components.schemas`, above `HealthStatus` | three schemas absent | `InstanceDraftRequest`, `InstanceDraftSaved` and `VisibilityRequest` | `src/engine/instance-drafts.ts:15`, `:17-23`; `src/http/routes.ts:582-588` |
| `info.description` | claims the full instance lifecycle, and names neither the draft save nor the visibility change | names both | `docs/openapi.yaml:6-9` against `src/http/server.ts:581`, `:603`, `:605`, `:607` |

The draft save answers 400 on a bad body, and never 422. A Zod failure reaches
`parseJsonBody`, which raises `RequestShapeError` (`src/http/routes.ts:141`).
Do not copy the 422 wording from the submit entry.

No entry lists 404, which the second live requirement already forbids
(`openspec/specs/http-api-documentation/spec.md:89-91`). All four new entries
list 500, because their engine paths raise `NotFoundError`
(`src/runtime/api.ts:1387` and `:539-548`, mapped at `src/http/errors.ts:95`).

### Correction list: the `http-api-documentation` spec

| Where | Today | After this change | Evidence |
|---|---|---|---|
| coverage list, `:23-30` | 20 routes | 28 routes, gaining the draft save, the three visibility writes, the three attachments pairs and `GET /metrics` | `docs/openapi.yaml:649`, `:711`, `:755`, `:1051`; `src/http/server.ts:581`, `:603`, `:605`, `:607` |
| exclusion list, `:30-31` | four prefixes and `registry` | adds `templates/*` and the two `processes/:id/versions/:version` studio reads | `docs/openapi.yaml:10-13`; `src/http/server.ts:727`, `:729`, `:737-743` |
| scenarios, `:55-77` | four scenarios | six scenarios, adding the `templates/*` prefix, the version reads and the four entries | this change's delta |

The route `GET /processes/:id/versions` stays documented
(`src/http/server.ts:613`, `docs/openapi.yaml:170`). It lists published
versions, which an integration needs. Only the two reads below it leave the
document.

### Correction list: the exclusions test

| Where | Today | After this change | Evidence |
|---|---|---|---|
| `EXCLUDED`, `:15` | `admin`, `drafts`, `migration-plans`, `reporting` | gains `templates` | `docs/openapi.yaml:11` already names the `templates/*` prefix |
| test bodies | no assertion covers the four new paths | one assertion per path, plus a version-read check | `src/http/server.ts:581`, `:603`, `:605`, `:607` |

The version-read check must not match `/processes/{processId}/versions`, which
stays documented. Match the longer path, or the assertion fails on a route
this change keeps.

The file slices the document three times, at `:33`, `:44` and `:57`. All three
slices survive. The visibility entries land above the `/account/me` key, and
the draft entry lands far above the `/ui-strings` key. The critique and report
09 both named all three. The slices at `:44` and `:57` run the same bounds.

### Correction list: the `spa-accessibility` spec

| Where | Today | After this change | Evidence |
|---|---|---|---|
| requirement name, `:60` | ends "carrying its expanded state" | ends "that carries its expanded state" | forced by the delta shape below |
| note, `:66-69` | a click-handling `<div>` header in both `StepsPanel` implementations | the rail replaced the cards; two disclosures remain, one native and one studio-built | `StepsRail.tsx:211-217`, `:234-251`; `StepPage.tsx:483`, `:719-720`; `PathsPanel.tsx:233`, `:248-253`; `ConditionInput.tsx:154-164` |
| scenario, `:71-75` | Enter expands a step card's header | Enter opens a step page from a rail row, and no row carries `aria-expanded` | `StepsRail.tsx:212`, `:214`; `studio-stepPage.test.tsx:171-177` |
| scenario, `:77-80` | `aria-expanded` announces a step card header's state | Enter toggles the step's read-only JSON, and the native pair announces its state | `StepPage.tsx:719-720`; `studio-stepPage.test.tsx:262-263` |

### Correction list: the two step tests

| Where | Today | After this change | Evidence |
|---|---|---|---|
| rail row assertions | rows are buttons, and one carries `aria-current` | one added assertion: no rail row carries `aria-expanded` | `studio-stepsRail.test.tsx:137-140`; `StepsRail.tsx:211-217` |
| step page comment, `:172-173` | "The page's one disclosure is the Developer view" | the count reads two, and names the guard toggle | `ConditionInput.tsx:154-164`; `PathsPanel.tsx:248-253` |

That assertion is what keeps the rewritten scenario testable. Without it the
first scenario rests on a reading of the component alone. The comment carries
the same count the rewritten note carries, so the tree stops holding both
answers. Its assertion scans `<h3>` tags and stays as it is.

### The three questions report 09 left open

**Question one covers the attachments trio and `GET /metrics`.** They join the
coverage list in this change. They already stand in the document. Leaving them
for later would ship a requirement this change knows to be short. One sweep of
the list costs nothing extra.

**Question two covers the missing `http-wrapper` requirement.** Nothing under
`openspec/specs/` states what the three visibility writes do. Documenting them
in the OpenAPI document leaves that gap open. This change records it and stops
there. Writing the requirement means stating the grant model, the
`visibility.changed` event and the revocation's survival across an assignment.
That is a behavior proposal rather than a drift correction.

**Question three covers the `system:admin` mapping.** The three entries state
the authority a caller needs today. That is the `system:admin` role, or a
`visibility` grant over this instance's process. They stay silent on whether
that role mapping is provisional. Two reasons hold that line. The table is
module-private on purpose (`src/auth/authorize.ts:81-84`), so no integration
can read it. A published hint that it may change invites an integration to
plan against an unpublished future. The comment at
`src/auth/authorize.ts:91-96` stays the place that records the reasoning, for
a reader of the engine.

### The disclosure delta removes and re-adds, and the rename follows

A `MODIFIED` block cannot drop a scenario. Validation reports the two old
scenario names as omitted. A `MODIFIED` requirement replaces the whole block,
and archive refuses to lose a scenario that way. Both old scenarios are false,
so keeping either name is out.

The delta therefore removes the requirement, with a Reason and a Migration,
and adds it back. Validation also rejects one name standing in both
`REMOVED` and `ADDED`, so the new name gains one word. The archived change
`2026-09-01-field-model-view-note` set this precedent, in the same shape and
for the same reason.

### The disclosure requirement's SHALL sentence stays byte-identical

The re-added requirement copies that sentence unchanged and rewrites only the
note and the two scenarios. The new note states that a native `<details>` pair
sits outside the requirement. The browser's own button role, keyboard handling
and state reporting justify that boundary. Six shipped sites use that pair,
including `StepPage.tsx:719`.

The SHALL sentence also demands `aria-controls`. Four components carry a
disclosure with `aria-expanded` alone: `Chrome.tsx:219`,
`ProcessHeaderBar.tsx:865`, `ConditionInput.tsx:159` and `RuleInput.tsx:167`.
That gap predates this change and stays open, because repairing four
components changes behavior and needs a browser check.

Counted by site there are six. A second site sits in the same component at
`RuleInput.tsx:148`. The sixth is `EditScreen.tsx:898`. It carries
`aria-controls` only above one member (`:899`). A one-member group therefore
leaves the attribute by itself.

One of the four sits on the step page the rewritten note describes. The step
page mounts `PathsPanel` (`StepPage.tsx:483`). That panel gives
`ConditionInput` the `disclosure` toggle variant, once per automatic path
(`PathsPanel.tsx:233`, `:248-253`). The toggle is a `<button type="button">`
with `aria-expanded` and no `aria-controls` (`ConditionInput.tsx:154-164`). The
note names it, the way the note it replaces named the gap of its own day.

The two scenarios stay two. A third scenario over that toggle has two shapes,
and both are wrong. One asserts the whole SHALL sentence, which the component
fails and this change declines to repair. The other asserts the
`aria-expanded` half alone, which accepts a control the SHALL sentence rejects.
A live gap belongs in the note instead. The test at
`studio-stepPage.test.tsx:171-177` scans `<h3>` tags alone, so it never sees
this toggle.

### Three review findings held in part, and the difference matters

The change review reported one Critical, two Warnings and five Suggestions.
The sections above answer every one. Three carried a claim the tree refuses,
so the wording above follows the tree.

The Critical says the guard toggle appears when the selected path is
automatic. Selection only styles a row (`PathsPanel.tsx:174`). The panel maps
every path, so a step with three automatic paths carries three toggles. The
note says "once per automatic path" for that reason.

The first Warning says the version-body read has five callers, and proposes
naming the versions screen and the canvas diff. Eight modules read it,
including the templates, tools and processes screens. The delta names the
developer area instead, which stays true as screens come and go.

The fifth Suggestion says the whitespace gate needs its files staged rather
than committed. Its CR probe does read worktree bytes. The file list comes from
`git diff --name-only` over the range (`scripts/gates/whitespace.sh:44`). A
commit is what puts a file in front of the gate, and the task preamble states
both halves.

### This change reaches past documentation

Two test files gain an assertion here. So `bun run typecheck`, `bun run build`
and the full `bun test` with `DATABASE_URL` set are all real gates. The plan
calls the suite untouched for every change in the set. That is wrong for this
one.

Run the suite in the devcontainer. Read the verdict off a named failure. Check
the skip count against the baseline.

## Risks / Trade-offs

- [The prefix check matches `/processes/{processId}/versions` and rejects a
  documented route] -> Match the full version-read path. The task list states
  this.
- [The `<details>` carve-out narrows a live requirement] -> It records what
  six shipped sites already do. The alternative leaves a note contradicting
  the sentence above it. That is the state this change exists to remove.
- [A delta file starts at base 0] -> Both delta files measure at exit code 0.
  The three findings in the `http-api-documentation` delta are advisory, and
  inherited verbatim from the live spec.
- [The visibility entries document routes no screen calls] -> A repo-wide
  search finds no caller in `packages/web`. The routes still run, and an
  integration reaches them. An undocumented running route is the state this
  change removes.

## Migration Plan

No deploy, no data migration, no rollback beyond `git revert`. The four
documented routes already run and keep their behavior.

## Open Questions

None left open for the implementer. The Decisions section above answers the
three questions report 09 raised. Two gaps stay unclosed on purpose: the
missing
`http-wrapper` requirement for the visibility writes, and the four disclosures
carrying `aria-expanded` with no `aria-controls`.
