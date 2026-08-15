# Third-Party Software Notices

This project is `workflow-engine`, licensed under the GNU Affero General
Public License v3.0-or-later (see `LICENSE`). It uses the open-source
packages listed below. `bun install` installs each one unmodified, under its
own license, per `bun.lock` / `package.json`.

This list reads name and version from `bun.lock`, then reads the `license`
field from each resolved package's own `package.json`. It also cross-checks
every workspace's `package.json` (`packages/*` + root). Regenerate it after
any dependency change.

Full license text for the SPDX identifiers below is the standard text
published at <https://spdx.org/licenses/> (e.g. `.../MIT.html`,
`.../Apache-2.0.html`).

## Container images

Pulled by `docker/engine.Dockerfile`, `docker/frontend.Dockerfile`, and
`.devcontainer/docker-compose.yml`. Not npm packages, so `bun.lock` does not
list them.

### Base images for the shipped production containers

| Image | Software | License |
|---|---|---|
| `oven/bun:1.3.11-slim` | Bun runtime | MIT |
| `nginxinc/nginx-unprivileged:alpine` | nginx | BSD-2-Clause ("nginx license") |

### External services the deployment connects to, not bundled

| Image | Software | License |
|---|---|---|
| `postgres:16` | PostgreSQL | PostgreSQL License |

### Development-only, never shipped

| Image | Software | License |
|---|---|---|
| `axllent/mailpit:v1.27` | Mailpit (SMTP test catcher, devcontainer only) | MIT |
| `mcr.microsoft.com/devcontainers/typescript-node:22` | Node.js devcontainer base | MIT |

These images each carry their own OS-level packages (Debian or Alpine system
libraries). This list does not enumerate those individually; see each
image's page on Docker Hub for its own bill of materials.

## Direct dependencies

Declared directly in a `package.json` (root or a `packages/*` workspace).

| Package | Version | License |
|---|---|---|
| `@dagrejs/dagre` | 3.1.1 | MIT |
| `@marcbachmann/cel-js` | 8.0.0 | MIT |
| `@panzoom/panzoom` | 4.6.2 | MIT |
| `@types/bun` | 1.3.14 | MIT |
| `@types/react` | 19.2.18, 18.3.31 | MIT |
| `@types/react-dom` | 19.2.4, 18.3.7 | MIT |
| `@vitejs/plugin-react` | 6.0.5 | MIT |
| `immer` | 11.1.15 | MIT |
| `jose` | 6.2.4 | MIT |
| `lucide-react` | 1.29.0 | ISC |
| `react` | 19.2.8, 18.3.1 | MIT |
| `react-dom` | 19.2.8, 18.3.1 | MIT |
| `typescript` | 5.6.2 | Apache-2.0 |
| `vite` | 8.2.1 | MIT |
| `zod` | 4.4.3 | MIT |

`react`, `react-dom` and their type packages resolve twice. `packages/web`
declares `^19` and gets 19.2.8. `packages/form-ui` declares `^18` as a peer
range and keeps 18.3.1 under it.

## Transitive dependencies

Pulled in by the packages above. Most of it is build tooling: Rolldown and
Lightning CSS under Vite, plus small runtime helpers for React. Grouped by
license.

### MIT

`@dagrejs/graphlib` 4.0.5, `@oxc-project/types` 0.143.0,
`@rolldown/binding-android-arm64` 1.2.3,
`@rolldown/binding-darwin-arm64` 1.2.3, `@rolldown/binding-darwin-x64` 1.2.3,
`@rolldown/binding-freebsd-x64` 1.2.3,
`@rolldown/binding-linux-arm-gnueabihf` 1.2.3,
`@rolldown/binding-linux-arm64-gnu` 1.2.3,
`@rolldown/binding-linux-arm64-musl` 1.2.3,
`@rolldown/binding-linux-ppc64-gnu` 1.2.3,
`@rolldown/binding-linux-s390x-gnu` 1.2.3,
`@rolldown/binding-linux-x64-gnu` 1.2.3,
`@rolldown/binding-linux-x64-musl` 1.2.3,
`@rolldown/binding-openharmony-arm64` 1.2.3,
`@rolldown/binding-win32-arm64-msvc` 1.2.3,
`@rolldown/binding-win32-x64-msvc` 1.2.3, `@rolldown/pluginutils` 1.0.1,
`@types/node` 26.1.1, `@types/prop-types` 15.7.15, `bun-types` 1.3.14,
`csstype` 3.2.3, `fdir` 6.5.0, `fsevents` 2.3.3 (optional, Darwin-only, not
installed on this platform), `js-tokens` 4.0.0, `loose-envify` 1.4.0, `nanoid`
3.3.18, `picomatch` 4.0.5, `postcss` 8.5.26, `rolldown` 1.2.3, `scheduler`
0.23.2, `scheduler` 0.27.0, `tinyglobby` 0.2.17, `undici-types` 8.3.0

### ISC

`picocolors` 1.1.1

### Apache-2.0

`detect-libc` 2.1.2

### BSD-3-Clause

`source-map-js` 1.2.1

### MPL-2.0

`lightningcss` 1.33.0, plus its platform binaries at that same version:
`lightningcss-android-arm64`, `lightningcss-darwin-arm64`,
`lightningcss-darwin-x64`, `lightningcss-freebsd-x64`,
`lightningcss-linux-arm-gnueabihf`, `lightningcss-linux-arm64-gnu`,
`lightningcss-linux-arm64-musl`, `lightningcss-linux-x64-gnu`,
`lightningcss-linux-x64-musl`, `lightningcss-win32-arm64-msvc` and
`lightningcss-win32-x64-msvc`, each 1.33.0

## Notes

- `rolldown` and `lightningcss` arrive with Vite. Each declares one optional
  binary package per operating system and architecture
  (`@rolldown/binding-*`, `lightningcss-*`). Each binary carries the same
  license as its parent package. `bun.lock` names them all. An install
  materializes only the variant its platform needs.
- `lightningcss` is the one MPL-2.0 package here. MPL-2.0 is file-level
  copyleft, and it binds whoever modifies a covered file. This project uses
  the published package unmodified, and only at build time. The obligation is
  attribution.
- `typescript`, `vite`, `@vitejs/plugin-react`, and everything under
  "Transitive dependencies" are build-time tooling. Bun installs them, but
  the build does not bundle them into the shipped application code.
- Runtime/bundled libraries are `@marcbachmann/cel-js`, `jose`, `zod`,
  `react`, `react-dom`, `immer`, `@panzoom/panzoom`, `lucide-react`,
  `@dagrejs/dagre` (plus their small runtime helpers `@dagrejs/graphlib`,
  `scheduler`, `loose-envify`, `js-tokens`).
