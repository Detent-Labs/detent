# Tasks

## 1. The instance list and submit entries

- [x] 1.1 In `docs/openapi.yaml` `GET /instances`, add `visible` to the `scope` enum and add a `kind` parameter. Name the `read` path for `scope=all` with a `processId` in the description and the 403 line.
- [x] 1.2 In `POST /instances/{instanceId}/submit`, rewrite the description and the 403 line per design.md. Name the `not-claimed` and `not-claimant` types.

## 2. The read, publish, cancel and header entries

- [x] 2.1 Rewrite the authorization sentence of `GET /instances/{instanceId}` and every comment and attachment 403 line per design.md, with the requirement name.
- [x] 2.2 Name the stored grant in `POST /processes` and `POST /instances/{instanceId}/cancel`. Add the cancellable-step condition to cancel. Keep the response text `close-instance-reads-on-write-paths` wrote.
- [x] 2.3 In the header, state that every instance route uses the Runtime API Layer. Name the SaaS-mode 401 and 503, and the three routes that skip them. Drop "Unauthenticated" from the `observability` tag.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck` and `bun run build` in the devcontainer.
- [ ] 3.2 Run the full gated suite: `sh scripts/test-gated.sh bun test` with `DATABASE_URL` set.
- [ ] 3.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipe into `whitespace.sh`, on the host.

## Workflow follow-up

- Strike the change's entry in the audit index in `docs/decisions.md` when it archives.
