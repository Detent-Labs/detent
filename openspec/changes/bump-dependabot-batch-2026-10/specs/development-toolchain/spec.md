<!-- antislop: allow-file passive-voice -->
<!-- The scenarios keep the fixed SHALL/WHEN/THEN grammar of the live
     development-toolchain spec, which carries the same directive. -->

# Spec Delta

## REMOVED Requirements

### Requirement: Dependabot updates the lockfile the install reads

**Reason**: A `bun` entry for a workspace directory changes that member's
manifest and leaves the root `bun.lock` alone. The `frozen-lockfile` gate then
rejects every pull request it opens (#89, #91, #92). The root entry already
reaches every workspace manifest.

**Migration**: "Dependabot updates the root lockfile from one bun entry"
replaces it. Delete the `/packages/form-ui` and `/packages/web` entries from
`.github/dependabot.yml`.

## ADDED Requirements

### Requirement: Dependabot updates the root lockfile from one bun entry

`.github/dependabot.yml` SHALL declare the `bun` package ecosystem for the root
directory, whose `bun.lock` covers every workspace manifest. It SHALL NOT declare
a `bun` entry for a workspace directory. It SHALL NOT declare the `npm`
ecosystem. The `github-actions` ecosystem stays.

The root `bun` entry SHALL hold one group that names `react`, `react-dom`,
`@types/react` and `@types/react-dom`. The four then share one pull request.

#### Scenario: Only the root carries a bun entry

- **WHEN** a contributor reads `.github/dependabot.yml`
- **THEN** exactly one entry declares `package-ecosystem: "bun"`, with `directory: "/"`
- **AND** no entry names `npm`

#### Scenario: A workspace directory entry is rejected

- **WHEN** `.github/dependabot.yml` gains a `bun` entry for `/packages/web`
- **THEN** the Dependabot rule test fails and names that directory

#### Scenario: React and its DOM renderer update together

- **WHEN** a contributor reads the root `bun` entry
- **THEN** one group lists `react`, `react-dom`, `@types/react` and `@types/react-dom`
