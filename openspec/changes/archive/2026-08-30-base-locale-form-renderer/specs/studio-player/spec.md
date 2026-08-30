## ADDED Requirements

### Requirement: The Player's step form falls back to the process's base locale

The Player renders `en` as its own fixed content locale. A field's
`LocalizedText` label, and each of its option labels, SHALL still fall back
to `InstanceView.baseLocale` whenever a label carries no `en` entry. This is
the same fallback rule the end-user app's Task screen applies. It keeps the
Player's preview faithful to what a participant sees. That faithfulness is
this capability's own "what a developer previews is what a participant gets"
purpose.

#### Scenario: A Player field label falls back to the process's base locale

- **WHEN** the Player renders a step whose field label has no `en` entry
- **THEN** the label renders the process's `baseLocale` text rather than the
  field's raw `key`
