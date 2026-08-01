<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- The MODIFIED requirement below quotes the main spec verbatim except for
     the one paragraph this change rewrites. -->


## ADDED Requirements

### Requirement: The process header declares the process's base locale

The process header SHALL carry a control that reads and writes the process's
`baseLocale`. An author SHALL be able to declare a non-English base locale
without leaving the structural surface.

`baseLocale` decides which entry of every `LocalizedText` in the body is
mandatory, and publish requires it. Leaving it to the JSON surface alone made
a process authored only through the structural panels unpublishable.

The control SHALL write the typed value through, unvalidated. Live validation
reports a value that is not a well-formed locale code. That is the route
every other malformed authored value takes. The header SHALL NOT reject or
correct the keystroke.

When the typed value is a well-formed locale code, the studio SHALL also move
the edited content locale to it.

Without that move, the control opens a trap. The edited content locale decides
which entry every text input writes. It also decides which entry a newly
created step or field seeds. An author who declares `de` and keeps typing
would write every value under the previous locale. Each new entity would then
report a missing `de` entry while visibly holding text.

The studio SHALL NOT move the edited content locale for a value that is not a
well-formed locale code. A part-typed value would otherwise become a real
locale key. One character typed into any text field is enough.

#### Scenario: The header shows the draft's declared base locale

- **WHEN** a draft declaring `baseLocale: "de"` is loaded into the edit screen
- **THEN** the process header's base-locale control shows `de`

#### Scenario: Declaring a base locale moves the edited content locale

- **WHEN** an author changes the process header's base-locale control to `de`
- **THEN** the draft body's `baseLocale` is `de`, and the edited content
  locale is `de`. A step created next seeds its label under `de`

#### Scenario: A part-typed base locale leaves the content locale alone

- **WHEN** an author has typed `d` on the way to `de`
- **THEN** the draft body's `baseLocale` is `d`, and the edited content locale
  is whatever it was before

#### Scenario: Existing text without an entry for the new base locale reports

- **WHEN** an author changes the base locale to `de` on a process whose labels
  carry only `en` entries
- **THEN** live validation reports a missing base-locale entry for every
  `LocalizedText` in the body that carries no `de` entry

#### Scenario: A malformed base locale reports as a validation error

- **WHEN** an author types a value into the base-locale control that is not a
  well-formed locale code
- **THEN** the draft body carries that value, and live validation reports the
  error against `baseLocale`

## MODIFIED Requirements

### Requirement: Creating a draft for a published process starts from the latest published version

Creating a draft from the process list SHALL seed the draft body from the
process's latest published version. The studio SHALL read that body through
the published-version route before it writes the draft. It SHALL send the
result as the new draft's body, at `revision = 0`.

The published-version route returns the compiled body. A draft holds the
authored shape. The studio SHALL therefore strip the content the compile
pass injects before it writes the draft. That content is the reserved
cancel-sink step and, for a contracted process, the reserved cancel outcome
in `contract.outcomes`. The studio SHALL strip nothing else.

The write SHALL declare the version it seeded from as the draft's
`baseVersion`. The Versions screen compares the draft against it.

The seeded draft SHALL carry no stored layout. The canvas places steps that
have no recorded position, so a seeded process renders without one.

Creating a draft for a process with no published version SHALL write a body
declaring `baseLocale: "en"` and nothing else. It SHALL declare no base
version. Creating a new process SHALL keep both of those.

Publish requires `baseLocale`. The seed is the only place the structural
panels can supply it before the author has typed anything. The chosen value
matches the fallback every other studio reader already applies to a draft
that declares no base locale.

When the read of the published version fails, the studio SHALL report the
error and SHALL NOT write a draft. An empty draft must not silently replace
the seeded one. The process list would then show a draft the author never
authored.

#### Scenario: A published process seeds its draft

- **WHEN** a draft is created for a process with a published version
- **THEN** the stored draft body equals that version's authored shape, and
  the draft carries `revision` 0 with `baseVersion` set to that version. The
  edit screen renders the process's steps

#### Scenario: The seeded body carries no compile-pass content

- **WHEN** a draft is seeded from a published version of a contracted process
- **THEN** the stored body carries no step with the reserved cancel-sink id
  or key, and `contract.outcomes` carries no reserved cancel outcome

#### Scenario: The seeded body passes the studio's own validation

- **WHEN** a seeded draft is loaded into the edit screen
- **THEN** live validation reports no error that the published version did
  not already carry

#### Scenario: A never-published process starts with a base locale only

- **WHEN** a draft is created for a process with no published version
- **THEN** the stored draft body declares `baseLocale: "en"` and carries no
  other key. The draft carries no base version, and the edit screen renders
  no steps

#### Scenario: A new process starts with a base locale only

- **WHEN** a new process is created from the process list
- **THEN** the stored draft body declares `baseLocale: "en"` and carries no
  other key, and no published-version read precedes the write

#### Scenario: The new-process seed reports no missing base locale

- **WHEN** the body a new process starts from is parsed as an authored
  process body
- **THEN** no reported error names `baseLocale`

#### Scenario: A failed seed read writes no draft

- **WHEN** the published-version read fails while a draft is being created
- **THEN** the screen reports the error and no draft write follows. The
  process list still shows the process as having no draft
