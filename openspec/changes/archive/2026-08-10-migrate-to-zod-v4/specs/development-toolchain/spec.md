<!-- antislop: allow-file passive-voice -->
<!-- Why: a MODIFIED requirement carries the live spec's text verbatim, so the
     archive matches the header and loses no detail. The copied text writes
     "SHALL be pinned" and its scenarios write "dependencies are installed".
     Rewriting either into the active voice would make the delta differ from
     the requirement it modifies. The new scenarios below follow the same
     voice, so the requirement reads as one piece. No other rule is silenced
     here. -->

## MODIFIED Requirements

### Requirement: A runtime import is a declared runtime dependency of the package that imports it

Every package SHALL declare, in its own manifest, the packages it imports as
runtime values. It declares each one as a `dependency`. It uses a
`peerDependency` where the package is source-only, and its consumer compiles
it. A package SHALL NOT rely on workspace hoisting to supply a runtime import
it does not declare. A runtime import SHALL NOT sit in `devDependencies`.

The rule exists because the error is not theoretical. `bun install --production`
yields `Cannot find module "zod"` on the first import of the schema module. So
does a slim engine image. The error would first appear in whichever change
builds that image, not in the change that mis-declared it.

`zod` is the case that produced the rule, in both directions. It sat as a root
`devDependency` behind a public `exports` map. Browser packages imported it
while declaring it nowhere.

A dependency the contract rests on SHALL be pinned exactly. The pin on
`typescript` already shows that treatment.

One such dependency is `@marcbachmann/cel-js`, by explicit design. One CEL
library backs both the publish-time type-check and runtime evaluation.

Its error mode is silent. Guard evaluation is total, so an error becomes
`false`. The transform path degrades to a recorded drop. An
evaluation-semantics change therefore reroutes or parks already-published,
immutable definitions instead of throwing.

The reason SHALL sit next to the "one CEL library" rule it protects. An upgrade
is then a deliberate commit that re-runs the CEL suite.

`zod` is the second such dependency, and it carries the same treatment for a
different reason. `src/schema/definition.ts` is the contract itself. A package
that resolves zod SHALL name one exact version, so one workspace resolves one
zod.

A source-only package names a `peerDependency` range instead, under the rule
above. Its range SHALL admit the resolved version, and SHALL exclude every
earlier major. The contract's types reach that package as `z.infer` types, so a
range admitting two majors resolves one type against two zods.

`definitionHash` is the JCS hash of the parsed `ProcessBody`, not of the source
text. A zod release can emit one key more than the pinned release, or one key
less. Such a release changes the identity of an already-published version.
Every instance pins `{processId, version, definitionHash}`, so a changed
identity stops a pinned instance rehydrating.

A caret range admits that release without a commit. An exact pin makes the
upgrade a deliberate commit, which re-runs the hash test over `examples/`.

#### Scenario: A production install can start the engine

- **WHEN** dependencies are installed without development dependencies
- **THEN** importing the engine's public entry points succeeds

#### Scenario: A workspace package declares what it imports

- **WHEN** a workspace package imports a third-party package as a runtime
  value
- **THEN** that package appears in its own manifest, rather than being
  resolved from a hoisted root install

#### Scenario: A contract-critical dependency is pinned

- **WHEN** the manifest is inspected for the CEL library
- **THEN** it names an exact version, and the reason is recorded beside the
  rule that makes it load-bearing

#### Scenario: The schema library is pinned where it resolves, and ranged where it is a peer

- **WHEN** the engine root, `packages/web` and `packages/form-ui` manifests are
  inspected for zod
- **THEN** the engine root and `packages/web` name one exact version as a
  `dependency`
- **AND** `packages/form-ui` names a `peerDependency` range admitting that
  version, and no earlier major

#### Scenario: A published body keeps its hash across a schema-library upgrade

- **WHEN** a change upgrades the pinned zod version
- **THEN** each `examples/` body still hashes to the value the test records,
  and no recorded value changes
