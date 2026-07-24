# editor-i18n

## Purpose

Defines the editor's own UI chrome (panel titles, buttons, legends,
badges) rendering through a fixed, single-locale English string catalog
and `t(key)` lookup — no locale state, switcher, persistence, or
base-locale fallback exists, since only one locale has ever existed or can
exist in this design. Scoped to the editor's own interface text —
engine-sourced validation/issue messages and authored process content
(`label`/`description` in the Draft/contract) are explicitly out of scope.

## Requirements

### Requirement: Editor UI-chrome text renders through a shared catalog lookup

The editor SHALL render its own UI-chrome text (panel titles, buttons,
legends, badges, and similar static UI strings) through a shared `t(key)`
catalog lookup rather than as hardcoded literals scattered across
components. `EditorIssue.message` (engine-sourced validation/issue text) is
explicitly excluded — it is rendered as-is, never routed through the
catalog.

#### Scenario: UI-chrome string resolves from the catalog

- **WHEN** a component renders a UI-chrome string via `t(key)`
- **THEN** the rendered text is that key's catalog entry, not a hardcoded
  string literal duplicated in the component

#### Scenario: Validation issue messages are unaffected by the catalog

- **WHEN** the editor renders an `EditorIssue.message` in `IssueList`
- **THEN** the text is rendered exactly as returned by the engine
  validator, never routed through `t()`

### Requirement: Non-component code receives translated text as a parameter
Editor code that runs outside a React component or hook (e.g. `draft/
file-io.ts`'s file-picker type descriptions, `FileToolbar`'s error-fallback
helper) SHALL NOT itself depend on the UI-chrome catalog or call a
translation hook. It SHALL receive any translated display string it needs
as a parameter, resolved by the calling component.

#### Scenario: File I/O module renders no hardcoded English fallback
- **WHEN** the editor saves, loads, or exports a draft via `draft/
  file-io.ts`
- **THEN** any user-facing description string that module uses (e.g. a
  file-picker type description) was supplied by its caller, not resolved
  internally by that module

#### Scenario: Error-fallback text respects the active locale
- **WHEN** a file operation fails with a non-`Error`, non-`DOMException`
  value and the editor must show a generic fallback message
- **THEN** the rendered fallback text is the active locale's translation,
  not a hardcoded English literal, while an underlying platform error's
  own `message` (when present) is still shown as-is, untranslated — the
  same treatment as engine-sourced validation messages
