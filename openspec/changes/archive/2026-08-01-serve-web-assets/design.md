<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## Context

See proposal.md - Why. Two facts from the code shape the approach.

`createServer` (`src/http/server.ts:222`) returns a plain
`fetch(req): Promise<Response>` and matches routes with a flat `if` chain over
`url.pathname.split("/").filter(Boolean)`, ending at one terminal 404 on line
518. `url.pathname` is not percent-decoded, so `%2e%2e` reaches that line intact.

Actor resolution is per-handler: each route handler receives the injected
`ActorResolver` and calls it itself. The terminal 404 resolves no actor today,
so a static branch in that position inherits the same property without any
opt-out mechanism.

`docker/frontend.Dockerfile` already builds and serves an SPA behind nginx, one
package per invocation. This change does not replace it. It adds a second,
single-origin option.

## Goals / Non-Goals

**Goals:**

- One optional filesystem root, served behind every API route, with a
  containment boundary that has its own test.
- A unit surface that tests reach with `new Request(...)` and a fixture
  directory: no port, no build, no browser.
- No change to any existing route, to CORS handling, or to startup when the root
  is absent.

**Non-Goals:**

- Range requests, `ETag`/`If-None-Match`, and on-the-fly compression. A reverse
  proxy does these better, and the asset filenames are hashed, so a
  conditional-request path buys nothing.
- Serving from more than one root, or per-area roots.
- Any redirect at `/`. The engine must not need to know its outward address; the
  shell redirects client-side.
- Shipping built assets in `docker/engine.Dockerfile`. See Open Questions.

## Decisions

### A separate module, called from the terminal 404

A new `src/http/static.ts` exports one function that takes the request, the
decoded URL and the root, and returns a `Response` or `null`. `null` means "I
decline", and `server.ts` then returns today's JSON 404 envelope unchanged.

Alternative considered: inlining the logic at line 518. Rejected because the
containment check is the security-relevant part of this change and deserves a
module a test can call directly, without constructing the whole route table.

Alternative considered: an early branch before route matching, with `/assets`
reserved as a prefix. Rejected for the reason ROADMAP.md item 12 states: a
reserved prefix means every later API route has to avoid it.

### Containment by resolution, not by pattern

The module percent-decodes the path, joins it to the root, resolves the result
with `node:path`, and serves only when the resolved path equals the root or
starts with the root plus a path separator. A `URIError` from decoding declines
the same way a traversal does.

Alternative considered: rejecting a path that contains `..`. Rejected as a
blacklist: it has to also cover `%2e%2e`, `%252e%252e`, backslashes on Windows,
and every future encoding. Resolve-then-compare is a whitelist and needs no such
list.

### The root is resolved once, at the composition root

`startHttpServer` reads `WEB_ROOT`, falls back to
`packages/web/dist` resolved relative to `import.meta.dir`, checks that the
directory exists, and passes the path to `createServer` as an optional
parameter. An absent directory passes `undefined`, and `createServer` then has no
static branch at all.

This keeps the per-request path free of a directory stat, and it makes the
"engine runs unchanged without a built frontend" case a wiring fact rather than
a runtime condition. Its cost is that dropping a build into the root needs a
restart to take effect, which matches how every other deployment input to this
process behaves.

The default points at `packages/web/dist`, which does not exist yet. That is
deliberate: this change ships before `packages/web` does, so the default is
inert until the shell arrives, and no installation gets a surprise.

### `index.html` is the one file that is never cached

Every other file carries `max-age=31536000, immutable`, which the hashed
filenames make safe. `index.html` keeps its name across builds and names the
current hashes, so caching it immutably would pin a browser to one build with no
way back. It carries `no-cache` whether the module reaches it as the History-API
fallback or as a direct request for `/index.html`.

### No CORS headers on a served file

These assets are same-origin to the API by construction. The dev setup keeps
using Vite on its own port against `VITE_API_URL`, and Vite serves its own
assets there, so the static branch is never the thing a cross-origin browser
asks for.

## Risks / Trade-offs

- **A symlink inside the root that points outside it escapes the containment
  check.** `path.resolve` does not resolve symlinks. Mitigation: the root is
  build output an operator controls, not user-writable storage. The upgrade path
  is one `realpath` call per request if a deployment ever puts an untrusted tree
  under the root.
- **An unmatched `GET` under an API prefix now returns HTML, not a JSON 404.**
  `GET /instances/a/b/c/d` gets `index.html` once a root is configured. This
  follows directly from "no prefix is reserved" and is the accepted cost of that
  rule. An API client sending a malformed path reads a content type it did not
  expect instead of an error envelope.
- **A file under the root can shadow nothing, but an API route can shadow a
  file.** A build that emitted a file named `processes` would be unreachable.
  Acceptable: Vite emits `index.html` and a hashed `assets/` tree, neither of
  which collides with a route name.
- **No conditional requests means a cold browser downloads the shell document on
  every navigation.** It is one small HTML file with `no-cache`, and a reverse
  proxy can add validators.

## Migration Plan

Additive and reversible. No database change, no configuration change needed by
an existing installation: with `WEB_ROOT` unset and `packages/web/dist` absent,
the server behaves exactly as it does today. Rollback is a revert of the commit.

## Open Questions

- Should `docker/engine.Dockerfile` build and copy the frontend so the published
  engine image serves it, and does `docker/frontend.Dockerfile` plus its nginx
  config survive the consolidation? Deferred to step 5 of
  `consolidate-frontend-shell`, when exactly one package produces a bundle. The
  answer changes no requirement here: `WEB_ROOT` already covers whatever layout
  that image ends up with.
