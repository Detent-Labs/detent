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
| `@marcbachmann/cel-js` | 8.0.0 | MIT |
| `@panzoom/panzoom` | 4.6.2 | MIT |
| `@types/bun` | 1.3.14 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `@types/react-dom` | 18.3.7 | MIT |
| `@vitejs/plugin-react` | 4.7.0 | MIT |
| `immer` | 11.1.15 | MIT |
| `jose` | 6.2.4 | MIT |
| `react` | 18.3.1 | MIT |
| `react-dom` | 18.3.1 | MIT |
| `typescript` | 5.6.2 | Apache-2.0 |
| `vite` | 6.4.3 | MIT |
| `zod` | 3.25.76 | MIT |

## Transitive dependencies

Pulled in by the packages above (mostly build tooling: Babel/esbuild/Rollup
under Vite, plus small runtime helpers for React). Grouped by license.

### MIT

`@babel/code-frame` 7.29.7, `@babel/compat-data` 7.29.7, `@babel/core`
7.29.7, `@babel/generator` 7.29.7, `@babel/helper-compilation-targets`
7.29.7, `@babel/helper-globals` 7.29.7, `@babel/helper-module-imports`
7.29.7, `@babel/helper-module-transforms` 7.29.7, `@babel/helper-plugin-utils`
7.29.7, `@babel/helper-string-parser` 7.29.7,
`@babel/helper-validator-identifier` 7.29.7, `@babel/helper-validator-option`
7.29.7, `@babel/helpers` 7.29.7, `@babel/parser` 7.29.7,
`@babel/plugin-transform-react-jsx-self` 7.29.7,
`@babel/plugin-transform-react-jsx-source` 7.29.7, `@babel/template` 7.29.7,
`@babel/traverse` 7.29.7, `@babel/types` 7.29.7, `@esbuild/linux-x64`
0.25.12, `@esbuild/win32-x64` 0.25.12, `@jridgewell/gen-mapping` 0.3.13,
`@jridgewell/remapping` 2.3.5, `@jridgewell/resolve-uri` 3.1.2,
`@jridgewell/sourcemap-codec` 1.5.5, `@jridgewell/trace-mapping` 0.3.31,
`@rolldown/pluginutils` 1.0.0-beta.27, `@rollup/rollup-linux-x64-gnu`
4.62.2, `@rollup/rollup-linux-x64-musl` 4.62.2, `@rollup/rollup-win32-x64-gnu`
4.62.2, `@rollup/rollup-win32-x64-msvc` 4.62.2, `@types/babel__core` 7.20.5,
`@types/babel__generator` 7.27.0, `@types/babel__template` 7.4.4,
`@types/babel__traverse` 7.28.0, `@types/estree` 1.0.9, `@types/node`
26.1.1, `@types/prop-types` 15.7.15, `browserslist` 4.28.7, `bun-types`
1.3.14, `convert-source-map` 2.0.0, `csstype` 3.2.3, `debug` 4.4.3, `esbuild`
0.25.12, `escalade` 3.2.0, `fdir` 6.5.0, `fsevents` 2.3.3 (optional,
Darwin-only, not installed on this platform), `gensync` 1.0.0-beta.2,
`has-flag` 4.0.0, `js-tokens` 4.0.0, `jsesc` 3.1.0, `json5` 2.2.3,
`loose-envify` 1.4.0, `nanoid` 3.3.16, `node-releases` 2.0.51, `picomatch`
4.0.5, `postcss` 8.5.22, `react-refresh` 0.17.0, `rollup` 4.62.2, `scheduler`
0.23.2, `source-map-js` 1.2.1, `supports-color` 7.2.0, `tinyglobby` 0.2.17,
`undici-types` 8.3.0, `update-browserslist-db` 1.2.3

### ISC

`electron-to-chromium` 1.5.395, `lru-cache` 5.1.1, `picocolors` 1.1.1,
`semver` 6.3.1, `yallist` 3.1.1

### Apache-2.0

`baseline-browser-mapping` 2.11.0

### BSD-3-Clause

`source-map-js` 1.2.1

### CC-BY-4.0

`caniuse-lite` 1.0.30001806 (browser-usage data, not code)

## Notes

- `esbuild` and `rollup` (via Vite) each declare more
  operating-system/architecture-specific optional binary packages
  (`@esbuild/*`, `@rollup/rollup-*`) under the same MIT license as the parent
  package. This list names only the variants installed in a given
  environment, not the rest.
- `typescript`, `vite`, `@vitejs/plugin-react`, and everything under
  "Transitive dependencies" are build-time tooling. Bun installs them, but
  the build does not bundle them into the shipped application code.
- Runtime/bundled libraries are `@marcbachmann/cel-js`, `jose`, `zod`,
  `react`, `react-dom`, `immer`, `@panzoom/panzoom` (plus their small runtime
  helpers `scheduler`, `loose-envify`, `js-tokens`).
