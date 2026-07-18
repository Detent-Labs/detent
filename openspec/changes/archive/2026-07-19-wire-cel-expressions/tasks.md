## 1. Library spike & selection

- [x] 1.1 Spike candidate CEL libraries under Bun for a declared-env type-check phase. Two-round parallel spike of six libraries. `@celjs/parser` (original pick) has an empty `check()` stub — rejected. `libcel-ts` (original fallback) does not exist on npm. `cel-js`, `@kevinmichaelchen/cel-typescript` — no declared-env check.
- [x] 1.2 Winner: `@marcbachmann/cel-js` v8.0.0 (real `Environment.check()` against declared types, zero deps, also evaluates). Runner-up `@gresb/cel-javascript`. Design.md updated with evidence.
- [x] 1.3 `bun add @marcbachmann/cel-js` (v8.0.0); lockfile updated.

## 2. Expression context & type mapping

- [x] 2.1 `src/cel/check.ts`: pinned `instance` `{id, status, transitionSeq, currentStepId}`, `actor` `{id, roles}`, `child` `{outcome, data}` shapes.
- [x] 2.2 `celType()` — total catalog-type → CEL-type mapping.
- [x] 2.3 `buildEnv()` builds the declared env from the catalog (by key), context namespaces, and data sources (`dyn`); `child` for subprocess scope.
- [x] 2.4 Two scopes via which vars are registered: `result` only in output scope, `child` only in subprocess steps; unregistered refs error automatically.

## 3. Parse + type-check entry points

- [x] 3.1 `parseExpression()` — parse-only, no context (editor path).
- [x] 3.2 `validateProcessBody()` collects every Expression with location + scope and parse+checks each, returning typed `CelIssue[]`.
- [x] 3.3 `now()` / time refs rejected (env declares no time symbols; test locks it).

## 4. Wire into definition validation

- [x] 4.1 Lint pass `validateProcessBody(body)` over a parsed ProcessBody (kept out of `definition.ts` so the contract module has no CEL dependency).
- [x] 4.2 Issues carry the offending expression's location (`loc`) and message.

## 5. Tests (each invariant ships a rejecting test)

- [x] 5.1 Rejects a parse error.
- [x] 5.2 Rejects an unknown field reference.
- [x] 5.3 Rejects a type mismatch (number vs string).
- [x] 5.4 Rejects `result` in a guard; accepts it in an `Action.output` mapping.
- [x] 5.5 Rejects `child.*` outside a subprocess step; accepts inside.
- [x] 5.6 Rejects `now()`.
- [x] 5.7 Accepts a well-typed guard and the real `expense-approval.json` example end-to-end.
- [x] 5.8 Every base field type has a CEL-type mapping.

## 6. Verify & close

- [x] 6.1 `bun test` green (21 pass); `bun run typecheck` clean.
- [x] 6.2 CLAUDE.md updated: Roadmap #2 marked done (authoring-time), `src/cel/check.ts` recorded, formal-expression-context open question resolved.
- [ ] 6.3 Run `openspec validate`, then archive with `/opsx:archive`.
