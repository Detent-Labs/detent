## ADDED Requirements

### Requirement: A step view may declare tabs, and a view entry may name one

A `view` MAY declare `tabs`, an ordered array. Each member SHALL carry a
`key`, a non-empty string after trimming, and a `label` of type
`LocalizedText`. The array's own position SHALL be the tab order, the way
`view.fields` already carries entry order.

A view entry of either kind MAY declare `tab`, a string naming a tab's `key`.

Tabs are layout, exactly as `columns` and `span` are. A tab SHALL reach no
guard, no CEL context and no submission check. The field set a step submits
SHALL NOT change because its view declares tabs.

`tabs` and `tab` SHALL both be optional. This schema also deserializes stored
immutable bodies. A body written before this change SHALL parse as it does
today, and its `definitionHash` SHALL NOT move.

A tab SHALL have no `id`. Nothing outside its own view addresses a tab, the
same way nothing addresses a note. The `key` is what an entry names, which is
what `group` already does for a group field.

A tab's `key` SHALL therefore be its stable anchor within the view. This is
the one place a `key` anchors a reference, so the usual mutable-slug rule
does not reach it. An authoring surface SHALL NOT rewrite a tab's `key` once
an entry in that view names it. A rewrite would orphan every entry naming the
old value, which rule 2 then rejects.

#### Scenario: A view declares two tabs and assigns its entries

- **WHEN** a step's `view` declares two tabs, and every root entry names one
  of them
- **THEN** the body parses, and each tab keeps the position the array gives it

#### Scenario: A body published before this change parses unchanged

- **WHEN** the engine reads a stored body whose views declare no `tabs`
- **THEN** every view parses as it does today, and the body's
  `definitionHash` matches the one stored beside it

#### Scenario: Renaming a tab's label leaves its key alone

- **WHEN** an authoring surface changes a tab's `label`
- **THEN** the tab keeps its `key`, and every entry naming it still resolves

#### Scenario: Tabs change no submission

- **WHEN** a step's view declares two tabs and its entries are spread across
  both
- **THEN** the step's editable field set is the one it would carry with no
  tabs declared at all

### Requirement: A view's tabs and its entries form one hierarchy

A view declaring tabs SHALL hold the hierarchy `tabs`, then fields and
groups, then a group's own members. Five rules hold that shape. A body
failing any of them SHALL fail to parse.

1. Two members of one view's `tabs` SHALL NOT share a `key`.
2. A non-empty `tab` SHALL name a `key` the same view's `tabs` declares.
3. A view declaring at least one tab SHALL carry a non-empty `tab` on every
   entry that declares no `group`.
4. An entry declaring a non-empty `group` SHALL NOT declare a `tab`. Its
   group holds it, and the group's own entry is what names the tab.
5. A view declaring no tab SHALL NOT carry a `tab` on any entry.

An absent `tab` and an empty one both read as no tab. That matches the rule
`group` already follows.

Rule 4 is what makes a group atomic. A group and its members always share one
tab. No group draws half its members under one tab and half under another.

A tab holding no entry SHALL publish. The renderer hides such a tab rather
than drawing an empty panel, so an empty tab reaches no participant. The
`form-ui` capability owns that rule.

These five rules SHALL live in the `definition.ts` schema. The compile pass
carries none of them. That placement follows this capability's own rule. No
body published before this change carries `tabs` or `tab`, so no
already-published body can violate one of the five. The `validationMode`-requires-`validation`
refinement on `viewField` sits in the schema for that same reason.

#### Scenario: Two tabs sharing a key fail to parse

- **WHEN** a view's `tabs` declares two members whose `key` is `details`
- **THEN** the body fails to parse, with an issue locating the step and the
  second member

#### Scenario: A tab naming no declared tab fails to parse

- **WHEN** a view entry's `tab` is `summary` and the view's `tabs` declares
  `details` alone
- **THEN** the body fails to parse, with an issue locating the entry

#### Scenario: A root entry left out of every tab fails to parse

- **WHEN** a view declares one tab, and one of its root entries declares no
  `tab`
- **THEN** the body fails to parse, with an issue locating that entry

#### Scenario: An entry inside a group naming a tab fails to parse

- **WHEN** a view entry declares both a `group` that resolves and a `tab`
  that resolves
- **THEN** the body fails to parse, with an issue locating that entry

#### Scenario: A tab on an untabbed view fails to parse

- **WHEN** a view declares no `tabs`, and one entry declares `tab: "details"`
- **THEN** the body fails to parse, with an issue locating that entry

#### Scenario: An empty tab publishes

- **WHEN** a view declares two tabs, and no entry names the second
- **THEN** the body parses and publishes

#### Scenario: The five rules run on the read path

- **WHEN** the engine reads a body whose view declares a `tab` naming no
  declared tab
- **THEN** it fails to parse, rather than passing the read and failing only
  at publish

### Requirement: A tab label's base-locale check takes the schema placement

The rule a tab's `label` meets is `authored-content-localization`'s. It is
not a second rule. That capability requires a non-empty base-locale entry for
every `LocalizedText` value in the body. A tab's `label` is one of them.

This requirement records where that check runs. It SHALL run in the
`definition.ts` schema. Its call sits beside the ones `processBody`'s
superRefine already makes for a label, a description, an option label and a
note's text.

That placement follows this capability's own placement rule. An invariant
whose violation cannot exist in an already-published body MAY live in the
schema. No body published before this change carries a tab.

#### Scenario: A tab label omitting the base locale fails to parse

- **WHEN** a tab's `label` declares `fr` alone, and the body's `baseLocale`
  is `de`
- **THEN** the body fails to parse, with an issue locating the step and the
  tab

#### Scenario: The check runs on the read path

- **WHEN** the engine reads a body whose tab label omits the body's
  `baseLocale`
- **THEN** it fails to parse, rather than passing the read and failing only
  at publish

## MODIFIED Requirements

### Requirement: A step view holds entries of two kinds, and one of them is a note

A `view.fields` array SHALL hold entries of two kinds. An entry carrying no
`kind` key SHALL be a field entry, with the shape and the meaning it carries
today. An entry carrying `kind: "note"` SHALL be a note entry. A note
references no field and carries authored text.

A note entry SHALL declare `text` as `LocalizedText`. It MAY declare
`visible`, `group`, `span` and `tab`, each meaning what it means on a field
entry. It SHALL declare no `ref`, `required`, `readonly`, `validation` or
`validationMode`.

<!-- antislop: allow negation-habit - the live spec writes this paragraph verbatim -->

A field entry SHALL carry no `kind` key at all, rather than a literal marking
it as a field. The schema also deserializes stored immutable bodies. A required
discriminant would make every body published before this change throw on read.

Reading a stored body SHALL keep stripping, as it does for every other
undeclared key. Publishing SHALL reject a note entry that carries a field
entry's key. The two paths then behave exactly as they already do elsewhere.

The schema SHALL read an entry carrying a `kind` this contract does not
declare as a field entry. Publishing SHALL then report `kind` as an unknown
key on it. The schema SHALL read a `kind` that is not a string the same way.
No entry SHALL escape the unknown-key check by carrying a `kind` no member
claims.

Every other requirement in this capability phrased over a `view.fields[]`
entry reaches field entries alone. A note declares none of the keys those
rules name.

#### Scenario: A view mixes a note with field entries

- **WHEN** a step's `view.fields` holds a note entry followed by two field
  entries
- **THEN** the body parses, and the note keeps the position the array gives it

#### Scenario: Publishing rejects a note entry carrying a field key

- **WHEN** an authored body declares a note entry that also carries `ref`
- **THEN** publishing fails with a located issue naming `ref` on that entry

#### Scenario: A body published before this change parses unchanged

<!-- antislop: allow negation-habit - the delta copies this scenario from the live spec verbatim -->
- **WHEN** the engine reads a stored body whose view entries carry no `kind`
- **THEN** every entry parses as a field entry, and the body's
  `definitionHash` matches the one stored beside it

#### Scenario: A note takes its place inside a tab

- **WHEN** a note entry declares a `tab` the same view declares, and no
  `group`
- **THEN** the body parses, and the note belongs to that tab
