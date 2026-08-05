## Context

See `proposal.md` for motivation. The full technical rationale already
lives in `docs/superpowers/specs/2026-08-05-step-assignment-warning-design.md`,
written and approved during brainstorming. This document is that design's
OpenSpec-visible counterpart. It restates the decisions in brief and adds
nothing new; read the brainstorm doc for the full alternatives-considered
detail.

`StepsPanel.tsx` already renders `PluginEnvelopeEditor` for
`step.assignment?.strategy`. `DataSourcesPanel.tsx` already renders a
sibling warning, `unknownListKeyWarning` from `dataListKeysLogic.ts`, as a
pure function outside the `EditorIssue`/`runValidation` pipeline. This
change adds the one warning `openspec/specs/studio-app/spec.md` already
named as that warning's planned sibling.

## Goals / Non-Goals

**Goals:**

- One pure function, `assignmentWarning(terminal, assignment)`, decides
  whether a step draws the warning.
- The warning renders next to the assignment editor and never touches
  `EditorIssue`, `runValidation`, or the publish route.

**Non-Goals:**

- No dismiss or suppress mechanism per step.
- No check of whether a present `assignment` resolves to any candidates.
- No process-wide summary screen listing every unassigned step.

## Decisions

### Scope: every non-terminal step, any `type`

A terminal step has no outgoing paths, so nothing is ever submitted on it.
Every other step, `task` or `subprocess`, carries the same two costs an
absent `assignment` produces. One cost is a narrower floor on who may
act. The other is no inbox row for whoever the author intended to reach
it. The check does not special-case `step.type`.

### A pure function, not a route through `EditorIssue`

`runValidation` mirrors the engine's own publish-time validators. An
`EditorIssue` therefore always means "publish will reject this."
`assignmentWarning` stays outside that system, the same way
`unknownListKeyWarning` already does. `IssueList`'s one guarantee stays
intact.

```ts
export function assignmentWarning(terminal: boolean | undefined, assignment: unknown): string | undefined {
  if (terminal === true || assignment !== undefined) return undefined;
  return "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.";
}
```

### Rendering and data flow

`StepsPanel.tsx` renders the warning directly below the assignment
`PluginEnvelopeEditor`, in a `<p className="studio-warning">`. It reuses
the class `DataSourcesPanel` already defines. `step.terminal` and
`step.assignment` are already in the draft `StepsPanel` holds via
`useDraft()`. The function therefore needs no fetch and no new state.

This reuses `DataSourcesPanel`'s established warning placement and CSS
class, with no new visual decision to make. No separate frontend-design
skill pass runs for it on that basis.

## Risks / Trade-offs

- **[Trade-off] Every non-terminal step without an assignment warns, even
  a deliberately self-service one.** No suppress mechanism exists. The
  `db.list` warning already accepts the same cost.
- **[Known gap] One message covers a `task` step and a `subprocess` step
  alike.** Both carry a narrow floor and no inbox row. A branch on the
  step type would add code for no behavioral gain. Revisit only on a real
  report that the wording confuses a reader on a subprocess step.
- **[Known gap]** The check reads a raw value, not a working assignment.
  The plugin editor writes a full object on any pick, even an empty one.
  Opening it at all silences the warning for the rest of the session.
  Nothing publishes wrong: an incomplete pick still fails the registry
  check at publish, through the ordinary `EditorIssue` path instead.

## Migration Plan

Additive, browser-side only. No schema, route, or `definitionHash` input
changes. A process with every step already assigned renders no new
warning.

## Open Questions

None outstanding.
