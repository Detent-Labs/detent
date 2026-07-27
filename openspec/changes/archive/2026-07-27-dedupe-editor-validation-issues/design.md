## Context

`runValidation` (`validation.ts:38-101`) calls the engine's unmodified
publish-time validators and maps each dimension's issue list into
`EditorIssue` (`draft/issues.ts`). Four of the five mapping sites share
one shape exactly:

- `validateDurations(body)` -> `DurationIssue[]` (`{loc, value, message}`), lines 61-63
- `checkActionRegistry(compiled, registry)` -> `RegistryIssue[]` (`{loc, type, message}`), lines 77-79
- `validateProcessBody(compiled)` -> `CelIssue[]` (`{loc, src, message}`), lines 81-83
- `checkSubprocessChildRefs(body, stepIndex, childBody)` -> `CelIssue[]`, lines 95-97

Each does `for (const x of items) issues.push({ ...resolveLoc(body, x.loc), message: x.message, source: <literal> })`.
All four validators' issue types are structurally a superset of
`{ loc: string; message: string }` — `resolveLoc`'s own docstring
(`issues.ts:44-55`) already treats all four (plus Zod) as sharing a `loc`
concept, though Zod's is `path: (string|number)[]`, not a `loc: string`.

The fifth mapping site — the Zod-issues `.map()` in the early-return
branch (lines 45-56) — is NOT one of the four: it resolves against
`draft` (no parsed `body` exists yet when Zod itself rejects the Draft),
reads `issue.path` (an array), and returns a new `ValidationResult`
directly rather than pushing into the shared `issues` array being built
for the success path. Verified against current file contents before
designing this change.

## Goals / Non-Goals

**Goals:**
- Collapse the four identical-shape loops behind one `pushIssues` helper.
- Preserve every produced `EditorIssue`'s fields exactly (same
  `entityType`/`entityId`/`message`/`source` for every existing test case).

**Non-Goals:**
- The Zod-issue mapping branch — different input shape (`path` vs `loc`)
  and a different target for `resolveLoc` (`draft` vs `body`); see
  proposal.md "What Changes" for why forcing it through the same helper
  isn't worth it.
- Any change to validator call order, the `compiled`/`DurationValidationError`
  try/catch, or the `subprocessStepStatus` bookkeeping — untouched.

## Decisions

### Helper shape and placement

A local function in `validation.ts` (not a new file — this is a
single-file, single-caller helper, unlike `mapConfigIssues` which is
shared across three engine call sites in the same file):

```ts
function pushIssues(
  issues: EditorIssue[],
  body: Draft,
  items: readonly { loc: string; message: string }[],
  source: IssueSource,
): void {
  for (const item of items) {
    issues.push({ ...resolveLoc(body, item.loc), message: item.message, source });
  }
}
```

`items`'s type is structural (`{ loc: string; message: string }`), so
`DurationIssue[]`/`RegistryIssue[]`/`CelIssue[]` all satisfy it without a
cast — each has extra fields (`value`, `type`, `src`) `pushIssues` simply
ignores, same as the original inline loops did.

Alternative considered: place it in `issues.ts` alongside `resolveLoc`
(closer to the "four validators share a loc concept" docstring already
there). Rejected — `issues.ts` has no other `EditorIssue`-array-mutating
logic (it's pure lookup/resolution), and `pushIssues` has exactly one
caller (`runValidation`); keeping it local avoids growing `issues.ts`'s
surface for a single-caller helper, matching the project's
minimal-abstraction bias.

### Call-site changes

```ts
pushIssues(issues, body, validateDurations(body), "duration");
...
if (registry) pushIssues(issues, body, checkActionRegistry(compiled, registry), "registry");
pushIssues(issues, body, validateProcessBody(compiled), "cel");
...
pushIssues(issues, body, checkSubprocessChildRefs(body, stepIndex, childBody), "cel");
```

Control flow (the `if (compiled)` guard, the `if (registry)` guard, the
`body.workflow.steps.forEach` subprocess loop) is unchanged — only the
four inner loop bodies collapse to one-line calls.

### Testing

No new automated test — `pushIssues` is a direct extraction of an
existing loop body with no new branching or invariant. Existing coverage:
`packages/editor/test/validation.test.ts` already asserts specific
`EditorIssue` shapes for a duration-grammar error, a registry-config
error, a CEL type error, and a subprocess cross-process-ref error — one
test per consolidated site — so the existing suite is a direct regression
check for this exact change, not a gap. Run it explicitly (task below).

## Risks / Trade-offs

None identified — pure, behavior-preserving extraction with one caller
site per validator dimension; `validation.test.ts` already covers all
four consolidated sites individually.

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting
`validation.ts`.

## Open Questions

None outstanding.
