# Spec Delta

## MODIFIED Requirements

### Requirement: The build context excludes development-only files

A repo-root `.dockerignore` SHALL exclude development-only paths from every
Docker build context in this repository.

Docker anchors an entry that holds no slash and no `**` to the context root. A
name that occurs below the root as well SHALL therefore carry the `**/` prefix.
This covers `**/node_modules`, `**/dist`, `**/.git`, `**/test` and `**/.env`.
The bare form of any of these is an error, whatever else the file holds.

The file SHALL also exclude four root-only paths: `container`, `docs`,
`openspec`, and the scratch directory `tmp`. It SHALL exclude the two agent
worktree roots, `.claude` and `.worktrees`. Each of those holds a full copy of
the source per running agent. A context that keeps them varies by machine
rather than by commit.

Git ignores `.env`. On a developer machine it holds `AUTH_JWT_SECRET`, and the
engine image's `COPY . .` takes it. The container reads its environment from
the deployment, so the file changes no behavior. Excluding it keeps a secret
out of a published image.

#### Scenario: Building either image

- **WHEN** `docker build` runs for the engine image or the frontend image
- **THEN** the build context holds none of `node_modules`, `dist`, `.git`,
  `test` or `.env` at any depth
- **AND** it holds none of `container`, `docs`, `openspec`, `tmp`,
  `.claude` or `.worktrees` at the root

#### Scenario: A nested dependency directory

- **WHEN** `bun install` has written `packages/web/node_modules` and
  `packages/form-ui/node_modules`
- **THEN** the build context holds neither of them, because the entry reads
  `**/node_modules` rather than `node_modules`

#### Scenario: The local environment file stays out of the image

- **WHEN** a reviewer looks for `/app/.env` inside a built engine image
- **THEN** no such file exists, and the container takes `AUTH_JWT_SECRET` from
  its runtime environment as this capability already requires
