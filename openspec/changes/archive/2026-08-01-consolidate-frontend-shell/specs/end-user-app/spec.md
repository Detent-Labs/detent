<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: Login screen authenticates against POST /auth/login

The shell, not the app area, SHALL provide the one login screen collecting
email and password and submitting them to `POST /auth/login` (see the
`unified-shell` capability). On success it SHALL persist the returned session
to `localStorage` and navigate to the area the actor's roles select, which for
an actor holding no reserved role is the app area's my-tasks screen (`/app`).
On failure it SHALL display a generic login failure and persist no token.

The app area SHALL NOT carry a login screen of its own.

#### Scenario: Successful login navigates to the inbox

- **WHEN** a participant submits valid credentials on the login screen
- **THEN** the returned session is persisted to `localStorage` and the browser
  navigates to `/app`

#### Scenario: Failed login persists no token

- **WHEN** a user submits credentials `POST /auth/login` rejects
- **THEN** the login screen displays a generic login failure and `localStorage`
  holds no token

### Requirement: Routing is a hand-written History-API hook covering four routes

The app area SHALL implement `/app`, `/app/tasks/:instanceId` and `/app/start`,
with `/login` owned by the shell, through the shell's one small hand-written
History-API hook and with no routing library dependency. Task URLs SHALL be
directly shareable and bookmarkable.

The area's own matcher and path builder SHALL work in paths relative to the
`/app` prefix and SHALL NOT know the prefix themselves. The shell strips it on
the way in and prepends it on the way out.

#### Scenario: Navigating to a task URL directly loads that task

- **WHEN** a user loads `/app/tasks/:instanceId` directly (for example via a
  bookmarked or shared URL) with a valid session
- **THEN** the app area renders that instance's task screen without first
  passing through the inbox

#### Scenario: The area matcher never sees the prefix

- **WHEN** the browser is at `/app/tasks/inst_x`
- **THEN** the app area's matcher receives `/tasks/inst_x`, unchanged from what
  it matched before the consolidation

#### Scenario: No routing library is a dependency

- **WHEN** `packages/web/package.json` dependencies are inspected
- **THEN** no routing library (for example `react-router`) appears among them

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

#### Scenario: Process content falls back to baseLocale

- **WHEN** a `LocalizedText` value has no entry for the active locale
- **THEN** it resolves using the process's `baseLocale` entry instead

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
