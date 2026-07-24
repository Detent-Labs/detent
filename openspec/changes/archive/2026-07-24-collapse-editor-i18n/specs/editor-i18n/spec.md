## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Editor UI-chrome text is localizable

**Reason**: Superseded by "Editor UI-chrome text renders through a shared
catalog lookup" — the lookup is no longer locale-aware, since only one
locale has ever existed or can exist in this design; it is a fixed English
catalog, not a per-locale resolution.

**Migration**: No author-facing or behavior change — every UI-chrome string
still renders identical English text; `EditorIssue.message` is still never
routed through the catalog.

### Requirement: Default locale is English

**Reason**: There is no "default" being selected from a fallback chain
anymore — English is the only value that has ever existed or can exist in
this design, not a fallback from an absent or invalid selection.

**Migration**: No author-facing change — the editor always rendered English
before this change too; there is simply no longer a selection mechanism to
fall back from.

### Requirement: Missing translation keys fall back to the base locale

**Reason**: No non-base catalog exists or can exist in this design; `t(key)`
reads the one fixed catalog directly. This requirement described a fallback
branch that had nothing to fall back from.

**Migration**: No author-facing change — every key already resolved to its
`en` entry; reintroduce this requirement only alongside an actual second
locale.

### Requirement: Locale is manually switchable, persisted, and extensible

**Reason**: The switcher, its persistence, and its "extensible with no code
change" guarantee existed for a locale space that never grew past one.
Removing them is the core of this change (ponytail-audit finding #2).

**Migration**: No replacement control. Reintroduce a switcher only when a
second locale is actually authored.

### Requirement: Locale state is exposed independent of the string catalog

**Reason**: There is no locale state left to expose independently of
anything — `t()` is the whole surface now, a plain function with no
separate state to read.

**Migration**: No replacement. Code that needs the current locale has
nothing to read, since there is exactly one, permanently.
