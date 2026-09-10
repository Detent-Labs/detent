## 1. The Purpose paragraph

- [x] 1.1 In `openspec/specs/studio-json-view/spec.md`, edit the Purpose
      paragraph alone. Replace "alongside Canvas and Panels
      (`studio-canvas`)" with "alongside the structure surface"; the
      structure surface spans ten tab bodies, and that capability covers
      one. Replace "ported verbatim from
      `packages/editor/src/draft/load-guard.ts`" with "in
      `packages/web/src/areas/studio/draft/load-guard.ts`". Replace
      `ProcessHeader` with `ProcessHeaderBar`. Keep the paragraph at its
      thirteen lines (5-17); do not reflow. Touch no line at or below
      `## Requirements`. Verify:
      `grep -c "packages/editor" openspec/specs/studio-json-view/spec.md`
      prints 0. Verify:
      `grep -c "studio-canvas" openspec/specs/studio-json-view/spec.md`
      prints 0. Verify:
      `grep -c "studio/draft/load-guard.ts" openspec/specs/studio-json-view/spec.md`
      prints 1. Verify:
      `grep -c "ProcessHeaderBar" openspec/specs/studio-json-view/spec.md`
      prints 1. Verify:
      `grep -c "structure surface" openspec/specs/studio-json-view/spec.md`
      prints 1. Verify:
      `grep -c "Panels" openspec/specs/studio-json-view/spec.md` prints 2.
- [x] 1.2 Measure the prose ratchet by the gate's own rule:
      `scripts/gates/prose.sh` counts printed lines when the linter exits 1,
      and 0 when it exits 0. The dispatch supplies the linter's absolute path
      and the scratch directory in place of `<antislop>` and `<scratch>`.
      Verify:
      `git show 79569c77:openspec/specs/studio-json-view/spec.md > <scratch>/sjv-base.md`
      then `python3 <antislop> check <scratch>/sjv-base.md 2>&1 | grep -c .`
      prints 40. Verify:
      `python3 <antislop> check openspec/specs/studio-json-view/spec.md 2>&1 | grep -c .`
      prints 40 or less.

## 2. Verification

- [x] 2.1 The spec still validates and keeps its shape. Verify:
      `openspec validate studio-json-view --type spec --strict` exits 0.
      Verify:
      `grep -c "^### Requirement:" openspec/specs/studio-json-view/spec.md`
      prints 5. Verify:
      `grep -c "^#### Scenario:" openspec/specs/studio-json-view/spec.md`
      prints 11.
- [x] 2.2 Hygiene over the one file. Verify:
      `git ls-files --eol openspec/specs/studio-json-view/spec.md` reads
      `w/lf`. Verify:
      `grep -cE '[[:blank:]]+$' openspec/specs/studio-json-view/spec.md`
      prints 0. Verify:
      `git diff --check -- openspec/specs/studio-json-view/spec.md` prints
      nothing.
- [x] 2.3 Scope. Verify:
      `git status --porcelain --untracked-files=no -- src packages test docs`
      prints nothing.
- [x] 2.4 Run `bun run typecheck`, `bun run build` and the full `bun test`
      with `DATABASE_URL` set, in the devcontainer, once and alone. A spec
      edit touches no code, so these confirm rather than test. Verify:
      `bun test 2>&1 | tee <scratch>/t.log; sh scripts/gates/silent-green.sh <scratch>/t.log`
      exits 0.
