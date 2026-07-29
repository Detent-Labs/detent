## Context

`configurable-cors-origins` made the HTTP wrapper's allowed origins
configuration rather than a constant, and gave the devcontainer a value:
`CORS_ALLOWED_ORIGINS: http://localhost:5173`, commented "Editor Player dev
server (Vite default port)". At that time `packages/editor` was the only
frontend, so one origin was the whole set.

Three frontends have landed since (`add-end-user-app`, `admin-shell-and-ops`,
`studio-shell-and-drafts`). All four use `"dev": "vite"` with a
`vite.config.ts` that sets only `plugins: [react()]` — no `server` block
anywhere. Vite's default port is 5173, and when it is taken Vite increments
until it finds a free one. So the four dev servers land on 5173-5176 in
whatever order they were started, and exactly one of them — whichever was
started first — matches the single allowlisted origin.

The engine side needs nothing: the allowlist mode, the per-request `Origin`
echo, and `Vary: Origin` all already exist and are tested. This is a wrong
configuration value plus a non-deterministic port assignment, not a missing
capability.

The failure mode is unusually unhelpful, which is why it is worth fixing
rather than documenting. A preflight from a non-allowlisted origin still
answers `204` and merely omits the origin header — deliberate, per
`http-wrapper`'s spec, since the browser is the enforcement point. The
developer sees a generic network error in one app while an identical-looking
sibling app works, with nothing in the server log to distinguish them.

## Goals / Non-Goals

**Goals:**

- All four dev servers can run simultaneously against one engine, in any
  start order, with no configuration edit.
- The package↔port mapping is deterministic and readable from the repo.
- A port collision is a visible startup failure, not a silent relocation.

**Non-Goals:**

- Any engine or `src/http/` change. The allowlist mechanism is already built.
- Production or non-devcontainer deployment. `CORS_ALLOWED_ORIGINS` is a
  composition-root variable; a real deployment sets its own value, and this
  change touches only the devcontainer's.
- Publishing/forwarding those ports from the container to the host browser.
  That is a separate concern (`host`/`--host` binding, compose `ports:`, or
  the editor's documented `devcontainer-exec` workflow) and is orthogonal:
  it decides whether the browser can *reach* the dev server at all, while
  this change decides whether the engine *answers* it once reached.
- Reducing the number of frontends, or the duplicated dev-server setup
  between them. `packages/editor` is scheduled for deletion by
  `studio-tools-and-player`; that change removes its port, and this one is
  written so nothing else has to be revisited when it does.

## Decisions

**Pin the port in `vite.config.ts`, not in the `dev` script.**
`"dev": "vite --port 5174 --strictPort"` would work identically at runtime.
The config file wins because the value is then visible to anything reading
the project's configuration rather than only to whoever runs that one script,
and because every package already has a `vite.config.ts` while the `dev`
script is the same three characters in all four — a divergence there is
easier to miss in review than a divergence in a config block.

**`strictPort: true`, not a bare `port`.** A bare `port` leaves Vite's
fallback behavior intact: if 5174 is taken, `admin` quietly serves on 5177,
which is not in the allowlist, and the developer is back to the original
symptom with an extra layer of indirection between cause and effect. The
silent slide *is* the bug; `strictPort` is what removes it. The cost is that
a stale process holding the port now blocks startup — which is the correct,
actionable failure.

**Assignment `app` 5173, `admin` 5174, `studio` 5175, `editor` 5176.**
5173 goes to `packages/app` because it is the participant-facing app and the
one most often run alone, so it keeps Vite's default and the most familiar
URL. `editor` takes the last slot precisely because it is scheduled for
deletion — removing it later leaves a gap at the end rather than a hole in
the middle that invites renumbering the survivors.

**Enumerate the origins; do not switch to `*`.**
`CORS_ALLOWED_ORIGINS: "*"` would cover all four in one character and never
need updating. Rejected: `configurable-cors-origins` recorded that `*` and
credentialed CORS are mutually exclusive per spec, and that a future
cookie/session-backed `ActorResolver` will need the allowlist mode. Trading
the allowlist away for four fewer entries would spend that decision to save a
line. The devcontainer is also the place a contributor reads to learn what
runs where; an explicit list documents the port map a second time.

**One requirement covering "add or remove a frontend ⇒ update the
allowlist".** Without it, the next frontend package repeats this bug exactly,
since nothing in the code links a new `vite.config.ts` to the compose file.
A spec requirement is the only mechanism this repo has that a future change's
review will actually check.

## Risks / Trade-offs

- **A developer with something already bound to an assigned port can no
  longer start that dev server at all** (previously it would silently move) →
  Intended. The error names the port; freeing it or changing the assignment
  in this repo are both one-step fixes, and both leave the config honest.
  The alternative is the current silent-and-broken behavior.
- **The port map now lives in two places** (four `vite.config.ts` files and
  one compose value) and can drift → Mitigated by the spec requirement tying
  them together, and bounded by size: five lines, one directory apart. A
  single generated source of truth would be more machinery than the drift it
  prevents.
- **The allowlist grows with every future frontend** → Accepted; it is one
  comma-separated entry per app, and the requirement makes updating it part
  of the change that adds the app.
- **This does not make the dev servers reachable from a host browser** if
  they are not already → Out of scope by design (see Non-Goals). Worth
  stating because a contributor debugging a connection failure could
  otherwise read this change as covering more ground than it does.

## Migration Plan

No data, schema, or API migration — this is dev-environment configuration.

1. Land the four `vite.config.ts` edits and the compose edit together. Split
   across two changes they would leave a window where the pinned ports do not
   match the allowlist, which is the bug this fixes.
2. `CORS_ALLOWED_ORIGINS` is read by `startHttpServer` at process start, so
   an already-running engine container must be restarted (or the `serve`
   process restarted) to pick up the new value. Recreating the compose
   service is enough; no rebuild.
3. Rollback is reverting the commit. Nothing persists: no database change, no
   published definition, no stored instance state is touched, so a revert
   restores exactly the prior behavior.

## Open Questions

- Should the dev servers also bind `host: true` and be published by the
  compose file, so a host browser reaches them without a separate forwarding
  step? Deliberately not decided here — it is the reachability half of the
  problem and has its own trade-off (binding `0.0.0.0` inside a container
  exposes the dev server to the host network). Worth a follow-up change if
  the current `devcontainer-exec` workflow proves to be friction.
- Should `packages/editor` be given a port at all, given
  `studio-tools-and-player` deletes it? Included here because the change may
  not land for a while and the editor is the *documented* Player workflow
  today; the cost of including it is one line and one allowlist entry.
