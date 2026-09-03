/**
 * `bun test` runs source through Bun's own transpiler, which knows nothing
 * of StyleX, so an uncompiled `stylex.create`/`defineVars` call would throw.
 * This stub replaces the package outright instead of compiling anything: a
 * style block resolves to its own key, so a rendered class name stays
 * legible in a test assertion (web-styling's "The test runner sees readable
 * class names, not compiled ones"). Registering through `mock.module` keeps
 * this preload scoped to whichever test process imports the package —
 * nothing under the engine's `src/` or `test/` does.
 */
import { mock } from "bun:test";

function keyedStrings<T extends Record<string, unknown>>(input: T): { [K in keyof T]: K } {
  const out = {} as { [K in keyof T]: K };
  for (const key of Object.keys(input) as Array<keyof T>) out[key] = key;
  return out;
}

mock.module("@stylexjs/stylex", () => ({
  create: keyedStrings,
  defineVars: keyedStrings,
  props: (...classNames: unknown[]) => ({
    className: classNames.filter((name): name is string => typeof name === "string" && name.length > 0).join(" "),
  }),
  defaultMarker: (value?: unknown) => value,
}));
