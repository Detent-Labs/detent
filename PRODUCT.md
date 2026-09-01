# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Detent serves four audiences. Two of them are primary and rank equally.

The process author builds definitions in the studio area. They work on a
canvas, in a form editor, and in the JSON view. They need the artifact they
draw to be the artifact that runs.

The participant completes tasks and approvals in the app area. They see one
form at a time and one named state. They need to know what the process asks
of them and what happens next.

Detent serves two further audiences. Neither outranks the two above. The
operator keeps running instances healthy in the admin area: outbox rows,
timers, migrations, stuck cases. The process owner reads cycle time,
bottlenecks and SLA in the reporting area.

## Product Purpose

Detent runs structured business processes with explicit states. Forms and
approvals drive a process. The engine executes a serialized JSON definition.
The studio builds that same definition on a canvas.

Success is a process an author can change without a developer, and that a
participant can complete without training.

## Positioning

Four properties define the product together. A neighboring engine could not
claim all four without rebuilding itself.

- One JSON definition serves three roles. The engine executes it, the studio
  builds it, and a person can hand-author it. No import step and no
  studio-only metadata sit between them.
- The paradigm is a state-based finite-state machine, not BPMN token flow.
  Exactly one step is active per instance. Every instance sits at a named
  state a person can point at.
- No-code and low-code both stay permanent. The builders cover the canvas,
  forms, guards and plugin config. The JSON view and the CEL input stay
  first-class beside them.
- The engine's correctness promises are the product. A published version is
  immutable. An instance pins `{processId, version, definitionHash}`. CEL is
  pure and total. State commits before any side effect dispatches.

## Operating Context

A process moves a case through steps connected by explicit paths. A step
presents a form, waits for a claim, or runs automatically. Timers fire
deadlines. Subprocesses call and return synchronously. Actions dispatch after
the state commits, through a transactional outbox.

All four audiences work from a browser. One build, one login, one session and
one address serve them.

## Capabilities and Constraints

The engine stays headless and API-first. It carries no UI dependency. An
integration drives a process over HTTP with no browser at all.

Hard v1 boundaries hold until a deliberate decision moves them.

- Exactly one active step per instance. No parallelism and no multi-instance
  steps.
- Subprocesses are synchronous call-and-return only. No fan-out.
- Action execution is async and post-commit. The `blocking` flag holds a
  reserved name that nothing implements.

The project is pre-1.0. No deployment runs this engine. No stored instance
pins a version anybody else depends on. A contract change costs an OpenSpec
change plus a sweep of the examples, the tests and the authoring guide.

Three domain words carry no synonym here. An operator is the admin area's
audience. A surface is what the studio presents. The phrase `definition
contract` names the whole JSON definition, while `contract` alone names the
`ProcessContract` a subprocess declares.

## Brand Commitments

The product name is Detent. The repository is public, under
AGPL-3.0-or-later.

Two files carry the visual language, and both bind. The rule set lives in
`.claude/rules/design-language.md`. The full reference with swatches and
specimens lives in `tmp/Detent Design Language.dc.html`.

Five rules decide the rest. Alignment and rules organize the page, not shadow
or color. No corner has a radius. The accent is a stamp, not a paint.

A value the engine matches exactly uses the mono face. A component reads a
semantic role, never a hex.

The written face is Archivo. `tokens.css` sets the mono stack. Icons are
Lucide at 18px with a 1.75 stroke.

The UI ships in English and German. Each area keeps its own catalog.

## Evidence on Hand

Real material exists. Use it instead of invented content.

- Seven example definitions in `examples/`. They cover `expense-approval`,
  `employee-onboarding`, `access-request`, `laptop-inventory`,
  `purchase-requisition`, and a parent/child subprocess pair.
- 99 capability specifications under `openspec/specs/`.
- `ROADMAP.md` and `docs/roadmap-history.md` record every finished stage.
- `docs/authoring-guide.md` teaches the definition contract to authors.

Nothing else exists yet. There are no customers, no testimonials, no
benchmarks, no pricing and no case studies. Future work must not invent any.

An open-source core with a commercial layer on top is intent, not fact. No
hosted offering and no enterprise edition exists today.

## Product Principles

- The serialized JSON definition is the single source of truth. Every
  authoring surface produces it.
- The engine stays headless. A UI concern never leaks into `src/`.
- Correctness is visible. A person can read an instance's state, version and
  hash.
- Both authoring layers stay. Adding a builder never removes the raw input
  under it.
- Explicit beats implicit. A named state, a named path and a named guard
  outrank a clever default.

## Accessibility & Inclusion

The `spa-accessibility` capability governs keyboard and assistive-technology
access across the browser packages.

- Anything that navigates is a real `<button>` or `<a href>` in the tab
  order, carrying an accessible name. A click handler on a row is never the
  only route.
- A disclosure is a button carrying its expanded state.
- Every focusable control renders a visible focus indicator.

WCAG 2.1.1 Keyboard, Level A is the standard the spec names for that first
rule.
