## Context

`VERSION` at the repo root holds `Major.Minor.Revision.BuildHash`. The
`.githooks/post-commit` hook keeps it current on every commit. Nothing in
`packages/web` reads it today.

`packages/web` is one Vite build the engine serves whole from `WEB_ROOT`.
The bundle's version is the one `VERSION` held at build time. It is not
one fetched later from a running server. See `proposal.md` for the
motivation.

## Goals / Non-Goals

**Goals:**
- Get the exact `VERSION` string into the built bundle with no runtime
  network call.
- Keep the account menu's existing structure and roles untouched; add one
  line, nothing else.

**Non-Goals:**
- No new HTTP endpoint for version info. The engine already knows nothing
  about `packages/web`'s build beyond serving its output.
- No parsing or display logic that treats the four segments differently
  (e.g. no "release channel" styling for the hash). It is one opaque
  string.

## Decisions

**Build-time `define`, not a runtime fetch.** Vite's `define` substitutes
a literal at build time. `vite.config.ts` reads `VERSION` with
`readFileSync`. That call runs during config evaluation, a Node context,
not the bundled code. It injects the result as `__APP_VERSION__`.

The path resolves relative to this file, not the invoking `cwd`:
`fileURLToPath(new URL("../../VERSION", import.meta.url))`. A
workspace-filtered build's `cwd` sits at `packages/web/`, two directories
below the repo root, so a `cwd`-relative path would miss. This matches the
`import.meta.url`-relative pattern `src/http/static.ts` and the
`packages/web/test` suite already use for the same reason.

Alternative considered: an API endpoint returning the server's own
`VERSION` at request time. Rejected. That adds a route and a fetch for a
value the build already fixes. `packages/web`'s "one build, one address"
convention already ties a bundle to one exact commit.

**A global ambient declaration, not an env var.** `__APP_VERSION__` gets a
`declare const __APP_VERSION__: string` line. It lands in a new
`packages/web/src/vite-env.d.ts`, or an existing ambient `.d.ts` if one
already declares globals.

Alternative considered: `import.meta.env.VITE_APP_VERSION`, Vite's usual
env-var channel. Rejected. That channel suits a value a deployer sets. It
does not suit a value this repo derives from a tracked file on every
build.

**Plain text, not a `menuitem`.** The version line renders as a `<div>` or
`<span>`, not a `<button role="menuitem">`. `Chrome.tsx`'s menu already
mixes an `aria-haspopup="menu"` popup with non-menuitem content: the
language row is a plain `<label>`, not a `role="menuitem"` button. This
follows that pattern instead of introducing a new one.

Strict ARIA authoring practice expects `role="menu"` to hold only
`menuitem`-family children. The language row already departs from that.
The version line mirrors an existing gap, not a new one. This change
fixes that gap for neither row.

## Risks / Trade-offs

- [Risk] The dev server never re-reads `VERSION` after it starts. A
  mid-session `VERSION` change can leave the shown value stale until
  restart. Mitigation: none needed. Vite re-evaluates its config on
  restart. A stale dev value costs nothing; drift in a shipped bundle
  would not.
- [Risk] `readFileSync` throws at build time if a shallow checkout leaves
  `VERSION` missing. Mitigation: none needed. Git tracks `VERSION` at the
  repo root. The commit hooks already depend on its presence, so its
  absence would already break commits.

## Migration Plan

No data or API migration. Ship as one change: the `vite.config.ts`
change, the ambient declaration, and the `Chrome.tsx`/`shell.css`
additions land together. The constant stays inert until `Chrome.tsx`
reads it.

## Open Questions

None.
