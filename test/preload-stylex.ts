/**
 * Compiles StyleX calls before a test module loads. `bun test` runs source
 * through Bun's own transpiler, which knows nothing of StyleX, so every
 * `stylex.create`, `defineVars` and `defaultMarker` reaches the runtime and
 * throws "Styles must be compiled by '@stylexjs/babel-plugin'". The unplugin
 * ships a Bun plugin whose `onLoad` runs the same Babel pass the Vite build
 * runs; registering it here compiles a component the moment a test imports it.
 *
 * That adapter targets `Bun.build()`: its `setup` calls `build.onStart` and
 * `build.onEnd`, which the runtime plugin API behind `plugin()` does not
 * carry, so it throws on registration. The shim below gives it the two hooks
 * as no-ops. `onStart` only reset the compiler's rule store, and `onEnd` only
 * wrote the dev CSS file, neither of which a test needs.
 *
 * The plugin resolves through `packages/web` because Bun's isolated linker
 * installs it under that package alone. `test: true` makes the compiler emit
 * readable class names and no CSS, which is what a `renderToStaticMarkup`
 * assertion can read. The CSS output path points at a temp file so a test run
 * writes nothing under the repository.
 */
import { plugin, type BunPlugin } from "bun";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStylexBunPlugin } from "../packages/web/node_modules/@stylexjs/unplugin/lib/bun.js";

const bundlerPlugin: BunPlugin = createStylexBunPlugin({
  dev: true,
  test: true,
  bunDevCssOutput: join(tmpdir(), "stylex-test.css"),
  unstable_moduleResolution: { type: "commonJS", rootDir: fileURLToPath(new URL("..", import.meta.url)) },
});

/**
 * The adapter's `onLoad` filter is every `.js`/`.ts(x)` path, `node_modules`
 * included. An async loader turns a module async, and Babel's own files
 * `require()` each other synchronously, so the compiler broke its own
 * dependency chain the moment a test loaded it: "require() async module ...
 * is unsupported". Only repository source needs compiling, so the filter is
 * narrowed to the `src` and `test` trees of the root and of each package,
 * plus the linker's copy of `form-ui`, which a web test reaches by package
 * name under `node_modules/.bun/form-ui@file+.../node_modules/form-ui/src`.
 * A Bun `onLoad` callback may not decline a file it matched, so the narrowing
 * has to sit in the filter itself.
 */
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sourceOnly = new RegExp(`^${escapedRoot}/((packages/[^/]+/)?(src|test)|node_modules/.*/node_modules/form-ui/src)/.*\\.[cm]?[jt]sx?$`);

plugin({
  name: bundlerPlugin.name,
  setup(build) {
    const scoped = Object.create(build) as typeof build;
    const noop = () => scoped;
    scoped.onStart = noop;
    scoped.onEnd = noop;
    scoped.onLoad = (constraints, callback) => build.onLoad({ ...constraints, filter: sourceOnly }, callback);
    return bundlerPlugin.setup(scoped);
  },
});
