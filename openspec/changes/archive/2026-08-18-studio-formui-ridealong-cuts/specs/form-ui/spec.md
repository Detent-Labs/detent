## MODIFIED Requirements

### Requirement: form-ui takes locale as a prop and holds no locale state

`form-ui`'s components SHALL accept `locale` as a prop and SHALL hold no
locale state of their own. Resolving which locale is active is entirely
the calling application's responsibility. The editor's Player passes `en`.
The end-user app passes its active locale.

`FieldForm` and `FieldInput` SHALL resolve every `LocalizedText` value
through this single `locale` prop alone. Neither component SHALL accept a
separate base-locale prop. A consumer that wants a fallback locale
resolves it before it calls `form-ui`.

<!-- antislop: allow passive-voice --><!-- Title matches the existing form-ui spec word for word, so archive keeps one cross-reference. -->
#### Scenario: A consumer's locale choice is respected

- **WHEN** a consuming application renders `form-ui` with a given `locale`
  prop
- **THEN** `LocalizedText` values resolve against that locale, with no
  locale value read from any state internal to `form-ui`

#### Scenario: form-ui exposes no separate base-locale prop

- **WHEN** a consumer renders `FieldForm` or `FieldInput`
- **THEN** the component's prop type offers no `baseLocale` prop
- **AND** `locale` is the only locale value the component accepts
