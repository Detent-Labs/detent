## 1. Engine storage

- [x] 1.1 Add the `templates` table to `src/engine/store.ts::initSchema`:
  `template_key text primary key`, `body jsonb`, `layout jsonb` default `'{}'`,
  `created_by text`, `updated_at timestamptz`. No version column, no hash
  column, no label column.
- [x] 1.2 Export `MAX_DRAFT_ENVELOPE_BYTES` from `src/engine/drafts.ts`. The
  template store then shares one bound rather than declaring a second.
- [x] 1.3 Write `src/engine/templates.ts`, modelled on `drafts.ts`. It exports
  `getTemplate`, `listTemplates`, `saveTemplate` and `deleteTemplate`.
  `saveTemplate` checks the envelope only and carries no revision check.
  `listTemplates` projects in SQL and returns no body. It returns the key,
  `body->'label'`, `body->'description'`, `created_by` and `updated_at`.
  `getTemplate` returns the whole body.
- [x] 1.4 Write `test/templates.test.ts`. Cover the round trip and a second
  write under one key. Cover a non-object body, a non-object layout, an
  oversized envelope, and a delete of a missing key. Assert that a list entry
  carries the label and no body.
- [x] 1.5 Append `TEMPLATES_ROLE` to `DEMO_USERS` in `scripts/seed.ts`, with
  `emailSuffix: "templates"`. `database-seed-script` requires one demo user per
  reserved role. Extend the seed test to the new count.

## 2. Routes and authorization

- [x] 2.1 Add `TEMPLATES_ROLE = "system:templates"` to `src/auth/authorize.ts`.
  Give it a doc comment shaped like `DATALISTS_ROLE`'s. Name the read
  asymmetry, and state that the role implies nothing.
- [x] 2.2 Add four handlers to `src/http/studio-routes.ts`. The `GET` handlers
  accept `TEMPLATES_ROLE` or `DEVELOPER_ROLE` with the check inline in each,
  and no shared helper. The `PUT` and `DELETE` handlers need `TEMPLATES_ROLE`.
- [x] 2.3 Register the four routes in `src/http/server.ts` beside the existing
  `/drafts` entries.
- [x] 2.4 Extend `test/http-studio.test.ts`. Cover one 403 per route per
  missing role. Cover a read by a `system:developer`-only actor, and a write
  that same actor cannot make.
- [x] 2.5 In `test/http-studio.test.ts`, assert that an actor holding only
  `system:templates` gets 403 from a draft route, a publish, an `/admin/*`
  route and a `/reporting/*` route.

## 3. Shell and per-screen gate

- [x] 3.1 Widen the studio entry in `packages/web/src/shell/areas.ts` to
  `["system:developer", "system:templates"]`. Change the comment that explains
  the admin area's two roles to cover the studio area too.
- [x] 3.2 Add a `ROUTE_ROLE` map to
  `packages/web/src/areas/studio/routing.ts`, shaped like the admin area's.
  The six existing screens take `system:developer`. Add a `templates` route
  taking `system:templates`, with its `matchRoute` and `routePath` arms.
- [x] 3.3 Read `ROUTE_ROLE` in `packages/web/src/areas/studio/root.tsx` for
  the navigation and the direct-hit guard, following
  `packages/web/src/areas/admin/root.tsx`.
- [x] 3.4 Move an actor stranded on the default `processes` route to the
  templates screen. Follow the `strandedOnDefault` effect in
  `packages/web/src/areas/admin/root.tsx`. `matchRoute` falls back to a screen
  the map denies a curator. Without the move, a curator meets a refusal as the
  first screen after login.
- [x] 3.5 Change the studio empty state so an actor holding neither studio
  role still learns why the area is empty. No change needed: the shell renders
  `area.forbidden` off `mayEnter`, which reads the widened set in `areas.ts`.
- [x] 3.6 Test the routing logic without a DOM. An actor holding only
  `system:templates` reaches the templates screen and no other. An actor
  holding only `system:developer` reaches the six and not the templates
  screen. Cover the stranded-default move too.

## 4. Studio screens

- [x] 4.1 Invoke `/frontend-design:frontend-design` and the Vercel skills.
  Cover the templates screen and the picker, before writing either.
  `CLAUDE.md` requires this for any new screen in `packages/web`.
- [x] 4.2 Add the four template calls to
  `packages/web/src/areas/studio/api/client.ts`.
- [x] 4.3 Write the templates screen: list rows labelled by the body's
  `label`, falling back to the template key. Delete behind a confirmation.
  One line of help text stating that a template is a snapshot.
- [x] 4.4 Add creating a template from a published version, through
  `stripCompiledContent`. A draft is not a source: the browser walk showed the
  curating role cannot read one. Widen only
  `GET /processes/:processId/versions/:version` to accept the role.
- [x] 4.5 Extract the picker's body-choosing logic beside `seededDraftInput`
  in `processListLogic.ts`, so it is testable without a DOM. A template choice
  yields the template's body and layout and no `baseVersion`.
- [x] 4.6 Turn `+ New process` into a picker offering an empty process or a
  template. The empty branch keeps today's `{ baseLocale: "en" }` seed. State
  in the picker when no template exists.
- [x] 4.7 Add `system:templates` to `RESERVED_ROLES` in
  `packages/web/src/areas/admin/screens/UsersScreen.tsx`.
- [x] 4.8 Test the extracted picker logic and the label fallback.

## 5. Documentation

- [x] 5.1 Record the new role and the templates table in
  `docs/current-state.md`.
- [x] 5.2 Mark stage 27d DONE in `ROADMAP.md`. Name the change and the new
  capability. Record that the studio area gained a per-screen gate.
- [x] 5.3 Check whether `docs/authoring-guide.md` states a rule this change
  alters. Change it in the same commit if it does.
- [x] 5.4 Refresh the `context:` block in `openspec/config.yaml`. It calls the
  reserved roles six and names `system:developer` alone as the studio gate.
  Both are stale after this change.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and report what it printed.
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set. Report the pass
  count and the skip count, not the pass count alone.
- [x] 6.3 Run the antislop linter over every Markdown file this change
  touched.
- [x] 6.4 Run `git diff --check`. Then run `git ls-files --eol` and read the
  `w/` column for CRLF.
- [x] 6.5 Walk the change in a real browser. Create a template from a
  published version. Seed a process from it. Delete a template. Confirm that
  an actor holding only `system:templates` sees the templates screen alone.

  The first walk refuted the two-source design. A curator could write a
  template and read no body to write. The draft source went, and
  `GET /processes/:processId/versions/:version` now accepts either studio
  role.
