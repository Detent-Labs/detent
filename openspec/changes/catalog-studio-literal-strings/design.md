# Design

## Context

The studio catalog (`packages/web/src/i18n/catalogs/studio.ts`) ships English
only. Its lookup `t(key)` takes no locale and no values. A sentence with a
number fills a `{name}` placeholder through `.replace("{name}", () => value)`,
the form `ChangeList.tsx` already uses. The function form keeps a `$` in the
value literal.

The catalog's header comment exempts "raw contract vocabulary shown as a bare
field label" from translation. That exemption is why `priority`, `kind` and
`description` stayed literal. The owner reversed it on 2026-10-19 (option C
of the mockup at https://claude.ai/artifact/3hzGJJirMeb66egzQNwdyW).

The repository pins TypeScript 7.0.2. It is the native compiler and has no
JavaScript parser API. The `vite` package is a direct dev dependency of
`packages/web`. It exports `parseSync`, an oxc parser that reads TSX.

## Shape brief (`/impeccable shape`, wording)

- **Job and audience.** The process author edits a path, a timer, a plugin or
  a subprocess call. The author reads a caption to learn what the control
  sets. A developer on the same screen searches for the JSON property.
- **Direction.** A caption leads with plain words in the label face. The JSON
  property it writes follows in the mono face, muted, after one space. A
  caption with no JSON property behind it shows plain words alone.
- **Boundaries.** No layout, spacing or control changes. Only the words and
  the trailing mono name. Option text that equals its own JSON enum value
  stays as it is.
- **Messages.** A validation message is one sentence in the error role, as
  today. It tells the author what to enter.

## Goals / Non-Goals

**Goals:**

- Every caption, legend, message and badge text in `panels/` reads through
  the catalog.
- A guard test keeps a new literal from landing in `panels/`.

**Non-Goals:**

- The five screens outside the process surface (`screens/`) and `root.tsx`
  keep their literals. They are a separate change (see Open Questions).
- No German studio catalog.
- No change to `migrationForm.unmappableLegend`, whose catalog value is
  already overridable.

## Decisions

### D1. One caption component, `KeyCaption`

`panels/shared/KeyCaption.tsx` renders `{text}` and, when `jsonKey` is set, a
space and a `<code>` with the name. The `<code>` takes the mono font and the
muted text role from the token module. About twenty sites use it.

A `ReactNode` reaches every legend and label slot, so `ActionListEditor`'s
`label`, `PluginEnvelopeEditor`'s `label` and `FieldExpressionMapEditor`'s
`legend` widen from `string` to `ReactNode`. Callers pass
`<KeyCaption text={t(...)} jsonKey="onEntry" />`.

Alternative: a `jsonKey` prop on each editor. Rejected: three components
would each grow the same prop and the same rendering.

### D2. Wording

Each row is one catalog key. The mono column is the `jsonKey`; a dash means
none.

| Site | Today | Plain words | Mono |
|---|---|---|---|
| Path row | `label` | Label | `label` |
| Path row | `key` | Key | `key` |
| Path row | `to` | Goes to | `to` |
| Automatic path | `priority` | Order among automatic paths | `priority` |
| Path actions legend | `onPath` | Actions when the path fires | `onPath` |
| Timer | `description` | Description | `description` |
| Timer | `kind` | When it fires | - |
| Timer | `deadline` | Deadline (CEL) | `deadline` |
| Timer | `onFire targetPath (bypasses the target path's guard)` | Path it takes when it fires (skips that path's condition) | `onFire.targetPath` |
| Timer actions legend | `onFire actions` | Actions when it fires | `onFire.actions` |
| Subprocess legend | `subprocess` | Subprocess | `subprocess` |
| Subprocess | `contractRef (child contract hash)` | Child contract hash | `contractRef` |
| Subprocess legend | `inputMapping` | Values passed to the child | `inputMapping` |
| Subprocess legend | `outputMapping` | Values copied back from the child | `outputMapping` |
| Plugin envelope | `type` | Type | `type` |
| Plugin envelope | `config (JSON)` | Settings (JSON) | `config` |
| Plugin envelope | `description` | Description | `description` |
| Data source | `key` | Key | `key` |
| Data source legend | `plugin` | Data source plugin | - |
| Header bar menu | `key` | Key | `key` |
| Header bar menu | `baseLocale` | Base language | `baseLocale` |
| Step page legend | `onEntry` | Actions on entry | `onEntry` |
| Step page legend | `onExit` | Actions on exit | `onExit` |
| Step page legend | `onCancel` | Actions on cancel | `onCancel` |
| Migration plan | `onUnmappable` | Policy | `onUnmappable` |

Messages, each one key with placeholders:

| Site | Today | Catalog sentence |
|---|---|---|
| Plugin config | `min N chars` | Enter at least {n} characters. |
| Plugin config | `max N chars` | Enter at most {n} characters. |
| Plugin config | `min N` | Enter {n} or more. |
| Plugin config | `max N` | Enter {n} or less. |
| Plugin config | `at least N item(s)` | Add at least {n} item(s). |
| Plugin config | `at most N item(s)` | Keep at most {n} item(s). |
| Plugin config | `invalid email` | Enter a valid email address. |
| Plugin config | `allowed: a, b` | Choose from: {values} |
<!-- antislop: allow sentence-length - a table row quotes a whole catalog value -->
| Data list | warning | The server has no data list '{list}'. Publishing still works. The field's options stay empty until an operator creates the list. |
<!-- antislop: allow em-dash - the catalog value itself prints an em-dash -->
| Locale option | `de — 3 missing` | {locale} — {count} missing |
| Badge | `registry config: not checked` | Registry config: not checked |
| Badge | `chaining target: not checked` | Chaining target: not checked |
| Badge | `cross-process: not checked` | Cross-process references: not checked |

`NotCheckedBadge` takes the whole sentence as `text`, so no sentence joins
from two parts. The key `issues.notChecked` loses its last reader and goes.

### D3. The guard test

`packages/web/test/studio-panels-literal-text.test.ts` walks every `.tsx`
under `areas/studio/panels/`. It parses each with `parseSync` from `vite`.
Three node shapes fail it:

- A JSX text node that holds a letter.
- A string or template literal that holds a letter. It fails as a JSX child,
  and as either branch of a conditional or logical child.
- A string literal as the value of a caption attribute. These are `label`,
  `legend`, `placeholder`, `title`, `aria-label`, `addLabel`, `removeLabel`
  and `hint`.

Three exemptions keep legal values out of the report. An `<option>` whose
text equals its own `value` prints a JSON enum value. A string literal equal
to a studio catalog key names a key, as `CollaborationControl`'s `legend`
does. A named allow-list holds `CEL` (a language name) and `v` (the prefix
before a mono version number). The test
also asserts that a planted literal in an inline source fails, so a parser
change cannot silence it.

Alternative: a regex scan. Rejected: `a > b && c < d` matches a JSX text
pattern, and multi-line text escapes a line regex.

### D4. Logic-file strings

`validateField` and `unknownListKeyWarning` return catalog sentences.
Unit tests assert that each returns the filled sentence and no `{` left
over.

## Risks / Trade-offs

- [A caption grows longer] → The plain words stay short, and the mono name is
  11px. The header bar's menu rows already wrap.
- [Option text that is a JSON enum value stays literal] → The exemption
  requires the text to equal the `value`. A reworded option fails the test.
- [Vite exports `parseSync`, and no parser package does] → Vite is a direct
  dependency. The planted-literal assertion fails loudly if the export goes.

## Migration Plan

No data migration. A deployment's existing overrides keep their keys. The
removed key `issues.notChecked` loses any override stored for it; the admin
screen lists only keys the catalog declares.

## Open Questions

- The `screens/` files and `root.tsx` hold about a hundred more literals
  (ProcessesScreen, PlayerScreen, ToolsScreen, VersionsScreen,
  TemplatesScreen, MigrationPlanScreen, EditScreen). The report names them
  as a follow-up change. Widening the guard test to `screens/` belongs there.
