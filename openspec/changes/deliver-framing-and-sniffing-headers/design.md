## Context

See proposal.md for motivation. Three facts shape the approach.

The engine's static branch has one response builder. `fileResponse` in
`src/http/static.ts` serves a direct hit, the `index.html` fallback and the
navigation answer. One change there covers all three.

The nginx block replaces the base image's own. Its comment says so, and it
records that every directive in it is load-bearing. A header the block does
not set is a header no response carries.

The meta policy comes from one function. `contentSecurityPolicy` in
`packages/web/vite.config.ts` builds the directive list and injects the tag
at build time.

## Goals / Non-Goals

**Goals:**

- No origin can frame an area of this product.
- The same four headers arrive from both serving paths.
- No directive stays in a place where the browser ignores it.

**Non-Goals:**

- No move of the whole policy into a response header. See the decision below.
- No `report-uri` and no reporting endpoint. Nothing consumes a report today.
- No change to `X-Forwarded-For` handling. See the proposal's out-of-scope
  note.

## Decisions

**The response header carries `frame-ancestors` alone.** Two policies then apply at
once: one from the meta tag, one from the header. A browser enforces their
intersection. Two sources for one policy drift, and a
drift shows up as a blocked script in production. It does not show up as a
test failure. The meta tag keeps what a meta tag honors. The header carries
only what a meta tag cannot.

**The engine gets the headers too, not only nginx.** The review named nginx.
The engine serves the same bundle from `WEB_ROOT`, and `CLAUDE.md` describes
that as the arrangement: one build, one address. A fix that covers only the
image would leave the primary path open.

**`X-Frame-Options` ships beside `frame-ancestors`.** It is one line. It
covers a client that predates CSP Level 2, and no browser rejects the pair.

**`Referrer-Policy: no-referrer`, not `same-origin`.** A URL in this product
carries instance and process ids. Nothing in the areas needs a referrer.
`no-referrer` also needs no reasoning about what counts as same-site.

**Assets get the headers too, not documents alone.** A per-type rule needs a
reader to know what a path returns. One rule at
`fileResponse` needs no such knowledge. An asset carries the headers at no
cost.

## Risks / Trade-offs

- A deployment that frames an area on purpose breaks → none exists here.
  `frame-ancestors` takes an origin list when one appears. The change that
  adds it widens the value in both places.
- Two policies now apply to a built page → they restrict disjoint
  directives, so the intersection equals their union here. The spec states
  that the header carries `frame-ancestors` alone, which keeps it true.
- A reader may look for the framing rule in the Vite config → the plugin's
  doc comment names where it moved.

## Migration Plan

Deploy. No table changes, no stored row changes, and no configuration to set
first. A browser picks the headers up on its next load, because the shell
document already carries `Cache-Control: no-cache`.

Rollback is the previous image.

## Open Questions

- Should `Referrer-Policy` become `strict-origin-when-cross-origin` if an
  area ever needs to send a referrer to a partner origin? Nothing needs one
  today. Changing the value later touches the two places this change edits.
