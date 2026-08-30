## ADDED Requirements

### Requirement: A shared helper resolves view fields against locale with base-locale fallback

`form-ui` SHALL export a pure function taking a `ResolvedViewField[]`, an
active `locale`, and a `baseLocale`. It SHALL return a `ResolvedViewField[]`.
In that result, every field's label, and every option's label, resolves to a
single entry keyed by `locale`. It SHALL use `baseLocale` as the fallback
wherever the active locale carries no entry. It SHALL NOT mutate its input.

This keeps the base-locale fallback outside `FieldForm`/`FieldInput`. "form-ui
takes locale as a prop and holds no locale state" still holds. Those two
components still accept no separate `baseLocale` prop. A caller that wants
the fallback applies this helper to `fields` first. That matches the
existing "a consumer resolves it before it calls form-ui" rule.

#### Scenario: A field label falls back to the base locale

- **WHEN** a caller runs the helper over a field whose label has an entry for
  `baseLocale` but none for `locale`
- **THEN** the returned field's label carries the `baseLocale` text, keyed
  under `locale`

#### Scenario: An option label falls back the same way

- **WHEN** a caller runs the helper over a field carrying an option whose
  label has no entry for the given `locale`
- **THEN** the returned option's label carries the `baseLocale` text, keyed
  under `locale`

#### Scenario: A field already resolved in the active locale keeps its text

- **WHEN** a caller runs the helper over a field whose label already carries
  an entry for the given `locale`
- **THEN** the returned field's label keeps that same text, keyed under
  `locale`
