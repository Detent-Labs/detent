## Context

See proposal.md's "Why" for the motivation. Three facts shape the approach.

`publishBody` splits its stages around the hash. `compileProcessBody` runs
first, and `definitionHash` derives from its output. Five stages run after the
hash-hit early return. `src/engine/definitions.ts:250-256` states why in a
comment. A re-publish of a body that predates a tightened check stays a no-op.
It does not become an issue for a version instances already pin.

The studio already holds the registry type names. `GET /registry`
(`src/http/studio-routes.ts:260-283`) returns `actionTypes`,
`dataSourceTypes` and `assignmentStrategyTypes`, plus a config descriptor per
type. `useRegistry` already fetches it for the plugin-config form. No studio
code passes any of it to `runValidation`.

`describeRegistry` (`src/http/studio-routes.ts:237`) returns
`ConfigFieldDescriptor[]`. That drives a form. It does not validate a config.
The live Zod schema stays on the server.

## Goals / Non-Goals

**Goals:**

- One module owns the stage order. Neither caller restates it.
- The order is a fact the type system holds, not a comment.
- The studio reports every publish blocker it holds the input for.
- A dimension without its input reads as not run, never as passing.

**Non-Goals:**

- Changing what a publish accepts or rejects.
- A new endpoint. The registry response already carries what this needs.
- Validating a plugin config in the browser.
- Unifying the four issue types. See proposal.md's Impact.

## Decisions

### Two exported phases, ordered by a compiled-body token

`src/schema/validate.ts` exports two functions.

`validateStructure(authored)` runs the Zod gate, duration validation, the
structural checks and the unknown-key check. It returns the issues and, on
success, the compiled body.

`validateReferences(compiled, inputs)` runs the three registry type-resolution
checks. It runs the config-validation checks when the caller supplies a live
registry. It runs the CEL check, the cross-process check and the chaining
check. It takes a compiled body, which only `validateStructure` produces.

`publishBody` calls the first, hashes, returns early on a hash hit, then calls
the second. The studio calls both in order. The hash-hit position stays
expressible, and it stays where it is today.

Alternative: one call taking a callback that runs between the phases. That
inverts the control flow to serve one caller's early return. Rejected.

Alternative: one call running everything, with the hash check moved ahead of
it. That re-runs the five post-hash checks on an identical re-publish. A body
published before a check tightened would then fail on re-publish. That is the
outcome the current comment exists to prevent. Rejected.

The compiled body is the ordering guarantee. A caller cannot run the reference
checks against an unparsed draft, because it has nothing to pass. The 37-line
ordering comment at `validation.ts:41-77` describes a hazard that stops being
reachable.

### The registry description is the three type arrays already on the wire

`RegistryDescription` carries `actionTypes`, `assignmentStrategyTypes` and
`dataSourceTypes`. The engine derives it from its live registries with
`[...registry.keys()]`. The studio passes the response it already fetches.

This is why the change needs no endpoint. The payload matches the type already,
field for field.

Alternative: send the config schemas as JSON Schema and validate in the
browser. That needs three new pieces. It needs a Zod-to-JSON-Schema step, a
JSON Schema validator in the bundle, and a second definition of every config
rule. Rejected.

### Config validation stays on the server, and the rail says so

`checkActionRegistry` and its two siblings keep a second half that reads
`HandlerDef.configSchema`. That half runs only when a caller supplies the live
registry, which only the engine holds.

The rail reports that half as held back. The existing spec already establishes
that honest reporting for the registry group. This change narrows it from the
whole group to one half.

### Process chaining reports under the CEL group

`validateProcessChaining` needs the target process's body, exactly as
`checkSubprocessChildRefs` needs a child's. The studio already loads child
bodies. It reports a per-site "checked" or "not-checked" state for them.
Chaining sites join that mechanism and report under the same `cel` source.

Alternative: a seventh `chaining` group. That adds a rail group for one check
whose held-back model already exists next door. Rejected.

The studio must load the bodies of processes a `process.start` action targets.
It reuses the subprocess child-loading path rather than adding a second one.

### The unknown-key check stays held back in the studio

`checkUnknownKeys` needs the raw authored body. The studio validates
`authoredProcessBody.safeParse(draft).data`, which the parse has already
stripped.

Running the check against the raw draft ahead of the Zod gate looks close. The
walk follows the contract's declared shape, so a half-built draft can break it.
That is the hazard the Zod gate exists to prevent. This change keeps the check
server-side and reports it held back.

A later change may reach it by giving the check a tolerant walk. That is its
own piece of work with its own risk, and it does not block this one.

### ValidationResult reports per dimension

`ValidationResult` replaces `registryChecked`, `structurallyValid` and
`structuralChecked` with one record keyed by dimension. Each entry reads `ran`
or `not-run`.

`checksRail.ts` loses two exclusion filters. `allChecksClear` and
`totalOpenIssueCount` stop naming `"registry"` as a special case, because the
registry group now reaches a clear state.

## Risks / Trade-offs

A clear rail today may show registry issues after this change. → Those issues
are real publish blockers. The draft already carries them. The author learns at
authoring time instead of at publish time. That is the change's purpose.

A later contributor could add a stage to the wrong phase. → The compiled-body
token blocks that direction. A reference check cannot run before the structure
check. A test asserts both callers receive identical issues for one body.

`GET /registry` sits behind `requireAuthoring`. → The studio's draft screens sit
behind the same authoring roles. No account gains a reach it lacks today.
Confirm this during implementation rather than assuming it.

Loading chaining target bodies adds fetches to a draft load. → A process with no
`process.start` action loads nothing new. The path reuses the child loader, so
one cache serves both.

The studio's issue count rises for existing drafts. That may read as a
regression. → Say so in the change's verification notes. Check one seeded
example in a browser before archiving.

## Migration Plan

No data migration. No definition contract change. No stored body changes shape.

Deploy in one piece. The engine's verdict is identical before and after. An
older browser bundle against a newer engine keeps working. The reverse keeps
working too.

Rollback is a revert. Nothing persists that a reverted build cannot read.
