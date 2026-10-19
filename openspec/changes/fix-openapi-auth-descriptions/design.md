# Design

## Context

See proposal.md for the motivation. The code is the reference, and this
change touches no code. The admitting paths per route, at HEAD `1f3e4a90`:

| Route | Admits |
|---|---|
| `GET /instances` | `scope=mine`, `started`, `visible`: any actor. `scope=all` (or none): `system:admin`; with `processId`, `read` on that process (role, grant or Reader list) |
| `GET /instances/{instanceId}` | `system:admin`; the claimant or a candidate; else the starter or a principal-set match, unless revoked. Beside `system:admin`, a test instance admits its starter alone |
| comments, attachments | the same rule as `GET /instances/{instanceId}` |
| `POST …/submit`, `PUT …/draft` | with an assignment, the claimant alone; without one, the starter or `system:admin` |
| `POST /processes` | `publish` on the body's `processId`: `system:publish` or a stored grant |
| `POST …/cancel` | `cancel`: `system:cancel-any` or a stored grant; else the starter, on a cancellable step |

The code for each row: `src/http/routes.ts` (`parseScope`, `parseKind`,
`handleListInstances`, the publish handler), `src/auth/authorize.ts`
(`can`), `src/runtime/internal.ts` (`loadInstanceForActor`) and
`src/runtime/instances.ts` (`requireSubmitAuthority`,
`canActorCancelInstance`).

An unclaimed step with an assignment answers 403 with type `not-claimed`.
A claim held by another actor answers 403 with type `not-claimant`
(`src/http/errors.ts`).

`src/http/server.ts` answers 401 `actor-resolution` for an unknown or
missing tenant in SaaS mode, and 503 `tenant-unreachable` when the
tenant's database is down. It answers both ahead of any route.

## Goals / Non-Goals

**Goals:** every authorization sentence in `docs/openapi.yaml` names each
admitting path the table above lists.

**Non-Goals:** the cancel and claim response bodies.
`close-instance-reads-on-write-paths` already wrote those entries. This
change keeps their response text and edits only the authorization
sentences. No code changes.

## Decisions

**A visibility statement stays short and points at the requirement.** The
owner ruled on 2026-10-19 (option A). Each read route carries one short
statement. It admits `system:admin`, the claimant and a candidate. It also
admits a participant whom no revocation names. Beside `system:admin`, a test
instance admits its starter alone. The statement then names the governing requirement in
`openspec/specs/authorization/spec.md`:
<!-- antislop: allow passive-voice -- a requirement name, quoted verbatim -->
`Reading one instance is authorized by relationship to it`. The comment and attachment entries
keep their existing pointer to `GET /instances/{instanceId}`, and only
their 403 lines change. The alternative was the full rule per route. It
repeats one rule six times and drifts, which CQ-2 warns against.

**A grant gets named, with a pointer to its requirement.** `POST /processes`
and `POST …/cancel` name "a stored grant over the process". Each points at
`A process-scoped gate asks one function over two tests`.

**The SaaS answers go in the header, once.** Every route can answer them.
A row per route would repeat one fact 28 times. The header sentence names both
types. The per-route status lists stay within the set the existing
requirement allows.

**The header lists the routes outside the Runtime API Layer.** `GET /livez`,
`GET /readyz`, `GET /metrics` and `GET /ui-strings` read no instance state
through `src/runtime/api.ts`. The header names them as the exception.

**No new test.** `widen-test-guards` already strengthened
`test/openapi-exclusions.test.ts` (G-10). A text assertion per sentence
would pin the wording alone.

## Risks / Trade-offs

- [The table drifts from the code again] → each sentence points at the
  governing requirement, where a reader can check it.
- [`kind=test` exposes test instances] → no: `includeTestInstances` stays
  limited to `scope=all`, whose gate already holds. The document says so.

## Migration Plan

None. The change edits one document and one spec, and no runtime state.

## Open Questions

None. The owner settled the one open question on 2026-10-19.
