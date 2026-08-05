## Why

Nothing seeds a new process today. `ProcessesScreen.tsx:140` mints a process
id and writes a draft holding `{ baseLocale: "en" }`. An author therefore
starts from an empty canvas every time. This is the last open item of
`ROADMAP.md` stage 27, the no-code and low-code authoring stage.

The studio already copies a body. `processListLogic.ts:74`,
`seededDraftInput`, reads a published version and strips the compile pass's
cancel-sink injection. Every call site hands it the source process's own id,
so the result is the next version of that process. Copying a body into a new
process is the gap this change closes.

## What Changes

- A `templates` table holds one authored body and its canvas layout per
  template key. `src/engine/store.ts::initSchema` creates it.
- A new module, `src/engine/templates.ts`, reads, lists, writes and deletes a
  template. It validates the envelope only, the rule `src/engine/drafts.ts`
  already applies to a draft body.
- Four routes in `src/http/studio-routes.ts` expose the table. `GET
  /templates` and `GET /templates/:key` accept `system:templates` or
  `system:developer`. The `PUT` and `DELETE` routes on `/templates/:key` need
  `system:templates`.
- `src/auth/authorize.ts` gains a seventh reserved role, `TEMPLATES_ROLE =
  "system:templates"`. It mirrors `DATALISTS_ROLE`. That includes the read
  asymmetry, which lets an author read what a curator writes.
- The studio area admits a second role. `packages/web/src/shell/areas.ts`
  widens the studio entry to `["system:developer", "system:templates"]`.
- The studio area gains a per-screen gate. A new `ROUTE_ROLE` map in
  `packages/web/src/areas/studio/routing.ts` puts the six existing screens on
  `system:developer` and the templates screen on `system:templates`. Without
  it, the widened area entry would open every studio screen to a curator.
- A new studio screen lists templates, creates one from the current draft or
  from a published version, and deletes one.
- `+ New process` opens a picker offering an empty process or a template. The
  empty branch keeps today's `{ baseLocale: "en" }` seed.
- `UsersScreen.tsx:26` lists `system:templates` among the reserved roles its
  editor offers.

Seeding a process from a template needs no new route. The browser reads `GET
/templates/:key` and sends the body to the existing `PUT /drafts/:processId`
with `revision: 0`.

No breaking change. Every existing role keeps every power it holds today. An
installation that never opens the new screen behaves as it does today.

## Capabilities

### New Capabilities
- `process-templates`: the `templates` table, the engine module over it, and
  the four routes. It also covers the curating role, plus the studio screen
  and picker that write and read a template.

### Modified Capabilities
- `authorization`: declares a seventh reserved role, `system:templates`, and
  the read asymmetry that also admits `system:developer`.
- `unified-shell`: the studio area entry admits two roles rather than one.
  The area therefore declares a per-screen role map, as the admin area does.
- `studio-app`: adds the templates screen and turns `+ New process` into a
  picker offering an empty process or a template.
- `database-seed-script`: the demo user set gains one account for the new
  role. That spec already binds this change. It says that adding a reserved
  role SHALL add its demo user alongside it.

`admin-app` needs no delta. Its Users screen requirement already says the
screen SHALL name the reserved `system:*` roles, without listing them. The new
role joins that list once `authorization` declares it.

## Impact

Engine: a new table in `src/engine/store.ts::initSchema`, a new module
`src/engine/templates.ts`, four handlers in `src/http/studio-routes.ts`, four
route entries in `src/http/server.ts`, one constant in `src/auth/authorize.ts`.

Tooling and project context: one entry in `scripts/seed.ts`'s `DEMO_USERS`, and
the reserved role list in `openspec/config.yaml`'s `context:` block.

Browser: `packages/web/src/shell/areas.ts`,
`packages/web/src/areas/studio/routing.ts`,
`packages/web/src/areas/studio/root.tsx`, a new screen under
`packages/web/src/areas/studio/screens/`, the process list screen, the studio
API client, and `packages/web/src/areas/admin/screens/UsersScreen.tsx`.

Untouched: `src/schema/definition.ts` and every rule it carries. A template
holds an ordinary authored body, so `definitionHash`, version immutability and
migration stay as they are. The `drafts` and `definitions` tables gain no
column.

Four things stay out of scope. `design.md` records the reason for each.
Built-in templates seeded by `bun run seed`, template versioning, a record of
which process came from which template, and permissions per template.
