# Design

## Context

Process A carries `{type: "instance.transition", config: {processId: "proc_B",
instanceIdField: "fld_target", pathId: "path_approve"}}` in an `onPath`.
`fld_target` is a plain text field. Participant T of A types `inst_X`, the id
of a B instance T cannot see, and submits. The handler reads
`acting.data[fld_target]` and checks the process, the status, the current step
and the manual trigger. It then moves `inst_X` as `SYSTEM_ACTOR`. Nothing in
that chain asks whether T may pick `inst_X`. See proposal.md.

Two existing mechanisms already answer that question, once the field is bound:

- A field bound to an `"instance.query"` data source offers the instance ids
  that source selects. The submit-time check in `src/runtime/fields.ts` rejects
  a value outside that set before the acting instance commits. The action then
  never enqueues.
- `can(actor, "migrate", processId, db)` answers whether an actor holds
  developer standing on a process. It admits the global developer role and a
  stored grant. It consults no access list.

The owner ruled on 2026-10-12. First, a publish rule plus a `kind` refusal in
the handler. Second, `migrate` on the target for `instance.transition` sites
only. Third, the source stays unfiltered, with no mandatory `stepIds`.

## Goals / Non-Goals

**Goals:**

- A participant can submit only an id that the field's bound source offers.
- An author needs developer standing on B to publish an action that moves B
  instances.
- The handler never moves an instance of another `kind`.

**Non-Goals:**

- No visibility filter on the `instance.query` source. Aggregate views stay
  unfiltered.
- No delivery-time recheck of the binding or of the option set.
- No change to `src/schema/definition.ts`, the studio or the HTTP surface.
- No mandatory `stepIds` on the source.

## Decisions

**The binding rule lives in `validateInstanceTransitionReferences`, next to
the catalog check.** It needs the publishing body only: the field's
`dataSource` id, the matching entry in `body.dataSources`, and that entry's
`config.processId`. It rejects with `CrossProcessValidationError`, the class
the neighbouring `instanceIdField` catalog check uses. The error names the
action's location and the field.

*Alternative: a body-aware check in `checkInstanceQueryValueFromField`'s
registry pass.* That pass reports data source issues as
`DataSourceRegistryValidationError`. The rule concerns an action, so the
action's own check is the better home. The studio already shows a
cross-process error against an action location.

**No delivery check.** A recheck needs the data source registry, and it resolves the option set again at every delivery. That path can drift from the submit-time one, which stays the single restriction. No deployment exists, so no published unbound body needs rescuing. A published version stays immutable, and an old unbound body stays unchecked at delivery. The `kind` refusal still protects it.

**The `kind` refusal sits beside the process check.** Both
compare the target with a fact about the acting instance. The refusal is
permanent, like the process mismatch.

**The `migrate` check is its own function, `validateInstanceTransitionWriteGrant`,
beside `validateCrossProcessReadGrant`.** The read check collects both site
kinds and keeps its behavior. The new check collects `instance.transition`
targets only. It skips when the caller omits the actor, and it runs after the
read check. `publishBody` then awaits eight DB-resolving checks. The two rules
files that say seven change to eight.

*Alternative: widen the read check with a per-site permission.* One function
would then hold two collections and two permissions. A separate function keeps
each requirement of the delta spec mapped to one check.

**A self-targeting action needs `migrate` too.** The route gates on `publish`
for the process under publication. `publish` and `migrate` are different
permissions. Exempting the self case would add a branch for one rare shape. An
author who may publish A but not migrate A is a setup worth surfacing.

**The trust model stays documented, with no extra enforcement.** The bound
source offers every instance its `statuses`, `stepIds` and `where` select. The
participant picks among them. The authoring guide and the spec say so. The
author bounds the set, and publish does not demand `stepIds`.

## Risks / Trade-offs

- [A published unbound body keeps running] → The `kind` refusal and the existing
  process and step checks still apply. No deployment exists, so no such body
  lives outside tests.
- [Another writer skips the option check] → An `Action.output` entry, a
  subprocess `outputMapping` or `contract.inputFields`, a `process.start`
  `inputMapping`, a column mapping or a literal `default` can write the field.
  Each is an author-written rule, never a participant value. The submit-time
  check covers the participant's own input.
- [The bound field can have a non-string type] → The handler refuses a
  non-string value at delivery, permanently. The rule leaves the type alone, to
  keep this change to the stated finding.
- [Authors with `read` on B lose the ability to publish] → That is the ruling.
  The error names the target process and the missing permission.
- [Source offers instances the participant cannot see] → The owner accepted
  this for aggregate views. The guide states it.
- [A test instance's action now fails at delivery] → The source lists published instances only. A test instance therefore picks a target of another kind. The refusal matches the finding, since the old behavior let a test run move a published instance.

## Migration Plan

No data migrates. Tests that publish an `instance.transition` action gain a
bound field and an actor holding `migrate`, where they pass an actor. Rollback
is a revert of the commit.

## Open Questions

None. The owner settled the three questions on 2026-10-12.
