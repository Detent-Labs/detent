# Design

## Context

The audit found each symbol by word search and the knowledge graph. It could
not run a TypeScript reference analysis. The installed TypeScript ships no
`tsserver.js`. `CLAUDE.md` warns that a grep detector flags 76 of 786
exports. Each deletion therefore needs a second check before it lands. Line
numbers in the audit refer to `5f41cd8a` and have moved since.

Refused simplification 41 in `docs/decisions.md` keeps an export that a test
imports. The owner ruled on 2026-10-19 that 41 protects a test seam of live
code. It does not protect a function whose rule no product surface uses.

## Goals / Non-Goals

**Goals:**

- Delete each symbol the brief names, or its `export`, with no change in
  behavior.
- Prove each deletion with the compiler, and use a text search only as a
  second check.

**Non-Goals:**

- No other dead export. A new find goes into the run report as one sentence.
- No change to the ten exports that 41 keeps for their test importers.

## Decisions

**The compiler is the reference check.** Drop the `export` or delete the
symbol, then run `bun run typecheck` across the engine, `web` and `form-ui`.
A remaining importer fails the build. A `git grep -w` over `src`, `packages`,
`test`, `scripts` and `e2e` then looks for a use by string, which the
compiler cannot see. The coordinator chose this pair in place of the missing
`tsserver`. The alternative, a custom script over the compiler API, would
answer the same question with more code.

**Drop `export` where the file still reads the symbol, delete it where
nothing does.** The registry entries, `dataListColumn`, the tenancy symbols,
`referencingPublishedProcesses`, `flattenFields` and the ten types each have
a reader in their own file. `InstanceTransitionConfig`, `stepIssueCount`,
`issueCountForEntityType`, `deleteReport`, `executeReport` and the reporting
`fieldLabel` have none, so they go.

No build emits declaration files. A type in an exported signature can
therefore lose its own `export`. `TenantConnections` and `ProvisionOptions` are two
such types.

**One draft size bound.** `instance-drafts.ts` imports
`MAX_DRAFT_ENVELOPE_BYTES` from `drafts.ts`. Both values are 8 MiB today, so
behavior stays the same. A single constant keeps the two bounds from
drifting apart.

**`flattenFields` keeps its own type.** `flattenDraftFields` takes a
`DraftField`, the studio's own draft shape. `flattenFields` walks the field
list of another process's published body, typed loosely on purpose. Reusing
`flattenDraftFields` would need a cast, so the local helper stays and loses
only its `export`.

**E1-12 deletes two functions and corrects three comments.**
`issueCountForEntityType` and `stepIssueCount` go with their tests. The
masthead filters its own issues in `panels/StepPage.tsx` (`mastheadIssues`). The comment on
`issueCountForSource` names a field catalog badge built on
`issueCountForEntityType`. The rail marks a row with `issueCountForEntityId`
instead. The comment on `issueCountForEntityId` names a per-view total that
does not exist. The header of `studio-sectionIssues.test.ts` says the
masthead total comes from `stepIssueCount`, which is false. The test that
asserts through `stepIssueCount` checks the section map alone after this
change.

**`form-ui` loses a prop and a parameter.** `PathButtons` drops `style`, and
its test of that prop goes. The form-ui delta replaces the requirement that
pinned the prop. `issueMessage` and `issueCountText` drop `baseLocale`, and
the fallback runs from `locale` to English. No caller passed `baseLocale`.
The tests that passed one go.

## Risks / Trade-offs

- [A use by string or dynamic import escapes the compiler] → The
  `git grep -w` sweep covers `src`, `packages`, `test`, `scripts` and `e2e`.
- [An integration imports `staticAssignmentStrategyDef` through the exports
  map] → No deployment runs this engine, and no code in the repository
  imports it.

## Migration Plan

None. No stored data, route or definition changes. A revert of the commit
restores every symbol.

## Open Questions

None.
