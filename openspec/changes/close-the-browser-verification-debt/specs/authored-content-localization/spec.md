## ADDED Requirements

### Requirement: An area renders authored text through the localized-text helper

Authored text carries one entry per locale. A missing entry must warn the
author, and only the localized-text helper raises that warning.

Every render site for authored text in `packages/web` SHALL call that helper.
A site that reads a `LocalizedText` value directly SHALL fail the suite.

The studio modal enumerated six warning sites by hand. The process label. A
step's label and description. A field's label, its description and an option
label. A hand-written list does not grow with the code. A static rule does.

The rule SHALL live beside the import rule in
`packages/web/test/boundaries.test.ts`, which already reads the area sources.
A site that needs no warning SHALL carry an inline comment saying why.

#### Scenario: A new render site warns

- **WHEN** an area gains a site that renders authored text
- **THEN** the site calls the localized-text helper
- **AND** an untranslated entry raises a warning there

#### Scenario: A direct read fails the suite

- **WHEN** a source file reads a `LocalizedText` value without the helper
- **THEN** the boundary test names the file and fails

#### Scenario: An exempt site says why

- **WHEN** a site legitimately needs no warning
- **THEN** an inline comment states the reason, and the rule skips it
