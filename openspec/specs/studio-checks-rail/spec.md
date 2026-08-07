# studio-checks-rail Specification

## Purpose

A persistent panel beside the canvas edit screen's inspector. It lists
every open validation issue for the loaded draft, grouped by source. It
gives an author one place to see everything holding a publish back.

## Requirements

### Requirement: The rail lists every open issue, grouped by source

The canvas edit screen SHALL show a checks rail beside the inspector. The
rail SHALL list every entry in the loaded draft's `validation.issues[]`.
The rail SHALL group entries by `source`: zod, structural, CEL, registry,
and duration.

#### Scenario: A structural issue appears in its group

- **WHEN** the loaded draft has a structural issue on some step
- **THEN** the checks rail shows that issue under a structural group

#### Scenario: Issues across sources each show in their own group

- **WHEN** the loaded draft has a structural issue and a CEL issue
- **THEN** the checks rail shows one group for each source, each holding
  its own issue

#### Scenario: A Zod-invalid draft's issues show in their own group

- **WHEN** the loaded draft fails Zod validation (`zodValid` is false)
- **THEN** the checks rail shows those issues under a `zod` group
- **AND** the structural, CEL, registry, and duration groups show held
  back, not empty

### Requirement: The rail reflects the held-back state of a structurally invalid draft

Per `authoring-invariants`, duration checks do not run until the draft
passes Zod validation. CEL and registry checks do not run until the
draft also compiles. The checks rail SHALL show the CEL and registry
groups as held back whenever `validation.structurallyValid` is false.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The structural group's own held-back state does not follow from
`zodValid` alone. `compileProcessBody` (`src/schema/compile.ts`) runs
duration validation before the six structural checks, and raises on the
first duration issue without ever reaching them. A Zod-valid draft that
fails duration validation therefore never runs its structural checks
for that load, whatever `validation.zodValid` reports.

The checks rail SHALL show the structural group as held back whenever
structural checks did not run. That state has a name:
`validation.structuralChecked`. It is false when structural checks did
not run and true when they did. This holds even when the draft is
Zod-valid and the duration group shows its own, real issues.

#### Scenario: A Zod-invalid draft shows every group held back

- **WHEN** the loaded draft is not Zod-valid
- **THEN** the checks rail shows the structural, CEL, registry, and
  duration groups as held back, not as empty or passing

#### Scenario: A Zod-valid draft with a duration issue holds the structural group back too

- **WHEN** the loaded draft passes Zod validation but fails duration
  validation, so `compileProcessBody` raises before structural checks
  run (`validation.structuralChecked` is false)
- **THEN** the checks rail shows the duration group's actual issues
- **AND** the checks rail shows the structural, CEL, and registry groups
  as held back, not as empty or passing

#### Scenario: A Zod-valid, uncompilable draft holds back CEL and registry only

- **WHEN** the loaded draft passes Zod and duration validation but fails
  to compile
- **AND** that means a structural issue (`validation.structuralChecked`
  is true, `validation.structurallyValid` is false)
- **THEN** the checks rail shows the CEL and registry groups as held back
- **AND** it shows the structural and duration groups' actual issues

#### Scenario: A fully valid draft runs every group

- **WHEN** the loaded draft is Zod-valid and `validation.structurallyValid`
  is true
- **THEN** the checks rail shows each group's actual issues, or a clear
  pass state when a group has none

### Requirement: The rail adds a consolidated view; it does not replace per-entity issue placements

`IssueList` SHALL keep rendering its existing per-entity views. Those
views sit under the process header, on a step card, and on a path row.
They also sit in a field's validation editor. The checks rail is one more
consolidated
view over the same `validation.issues[]` array. It does not replace those
placements.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue shows in the path's own `IssueList` placement and
  in the checks rail's CEL group

### Requirement: Every publish blocker is visible in the rail with all groups clear

The checks rail SHALL show no unresolved issue in any group when the
draft passes every check publish requires. An author SHALL be able to
tell from the rail alone whether the draft is publishable.

#### Scenario: A fully clear draft shows no open issues

- **WHEN** the loaded draft passes every structural, CEL, registry, and
  duration check
- **THEN** the checks rail shows all groups clear, and no entry remains
  in any group
