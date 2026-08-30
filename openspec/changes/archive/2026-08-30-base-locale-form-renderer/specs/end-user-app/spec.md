<!-- antislop: allow-file passive-voice -->
<!-- The two passive-voice hits below sit in text copied verbatim from openspec/specs/end-user-app/spec.md, as OpenSpec's MODIFIED-requirement rule requires; only the two new scenarios below are this change's own prose. -->

## MODIFIED Requirements

### Requirement: The app carries exactly one active locale, resolved with fallback

The shell SHALL hold exactly one active locale and pass it to every
`LocalizedText` resolution and to `form-ui`. Locale selection and persistence
SHALL live in `packages/web/src/i18n/`, shared by every area; the chrome string
catalogs SHALL stay per area. Process content SHALL resolve against the active
locale, falling back to the process's `baseLocale` when the active locale has
no entry. UI chrome strings SHALL be looked up from a catalog shaped `locale →
(key → text)`, shipping `de` and `en`. The initial locale SHALL come from
`navigator.language`; a header switcher SHALL change it and persist the choice.

Switching locale SHALL apply across areas, not per area.

The Task screen's step form is process content for this rule. A field's
`LocalizedText` label, and each of its option labels, SHALL resolve using
`InstanceView.baseLocale` as the fallback.

#### Scenario: Process content falls back to baseLocale

- **WHEN** a `LocalizedText` value has no entry for the active locale
- **THEN** it resolves using the process's `baseLocale` entry instead

#### Scenario: A task field label falls back to the process's base locale

- **WHEN** the Task screen renders a step whose field label has no entry for
  the participant's active locale
- **THEN** the label renders the process's `baseLocale` text rather than the
  field's raw `key`

#### Scenario: Initial locale comes from the browser

- **WHEN** the shell loads with no previously persisted locale choice
- **THEN** the active locale is derived from `navigator.language`

#### Scenario: The locale switcher persists a choice

- **WHEN** a user changes locale via the header switcher
- **THEN** subsequent loads use that chosen locale rather than
  `navigator.language`

#### Scenario: One locale choice spans the areas

- **WHEN** a user changes locale under `/app` and then navigates to `/studio`
- **THEN** the chosen locale is already active there
