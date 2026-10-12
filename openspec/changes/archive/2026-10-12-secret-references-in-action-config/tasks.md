# Tasks

## 1. The handler resolves a reference

- [x] 1.1 Widen the header value in `httpConfigSchema` to a string or a strict `{ env: NAME }`. A test publishes each bad shape and sees a located rejection.
- [x] 1.2 Resolve each reference in `buildHeaders` after the egress check. A test sees the resolved value on the request.
- [x] 1.3 Add the allowlist check for one tenant: unset list, name outside the list, entry with a colon. A test per case sees a permanent failure and no request.
- [x] 1.4 Refuse an unset variable, an empty value and an illegal header value before `fetch`. A test with a line break in the value sees the value in no message and no log line.
- [x] 1.5 Read the variable and the list at each delivery. A test changes the variable between two deliveries and sees the second value.

## 2. The tenant key reaches the handler

- [x] 2.1 Add the optional `tenant` to `HandlerContext`, pass it from `deliver` and from `host.ts`. A test sees `startEngine` hand the tenant key to the handler.
- [x] 2.2 Add the many-tenant allowlist form. A test with tenants `acme` and `beta` sees `acme:NAME` work for `acme` only, and an unscoped entry refuse for both.
- [x] 2.3 Ignore a scoped entry in a deployment with one tenant. A test sets `acme:NAME` with no tenant key and sees the reference refuse.
- [x] 2.4 Drive one reference through a transition, the outbox row and `deliver` into a local server. A DB test sees the header on the wire and only the reference in the stored row.

## 3. Documents

- [x] 3.1 Add the `HTTP_SECRET_ENV_ALLOWLIST` row and a section on rotation and the trade-offs to `docs/runbooks/deployment.md`. Check that the row and the section name the entry form.
- [x] 3.2 Teach the reference in `docs/authoring-guide.md`, and add one line to `README.md`. Check that both state the whole-value rule.
- [x] 3.3 Delete the `secret-references-in-action-config` entry from the audit index in `docs/decisions.md`. Check the index lists no other entry by this name.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`, then `bun run build`, then the full `bun test` through `scripts/test-gated.sh` with `DATABASE_URL` set. Read the verdict from a named failure.
- [x] 4.2 Run the prose and whitespace gates over the push range on the host.
