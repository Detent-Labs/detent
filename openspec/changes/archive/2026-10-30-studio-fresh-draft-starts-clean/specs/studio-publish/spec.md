## MODIFIED Requirements

### Requirement: The studio offers Publish only where the engine would admit it, and names the reason otherwise

When the loaded draft reports that the caller may not publish, the studio
SHALL render Publish as unavailable. The `process-drafts` capability owns the
field that carries the report. It also owns the rule that the screen reads
that field rather than a role.

The unavailable control SHALL stay rendered. Removing it leaves a developer
hunting for a control that is not there.

Beside that control, the screen SHALL state the reason in visible text. It
SHALL say that the account lacks the publish permission for this process.

That text SHALL name the permission rather than a role. A scoped grant and
the global role both satisfy the same gate. A `title` attribute SHALL NOT be
the only carrier of that reason. It reaches neither the keyboard nor a
screen reader.

The control SHALL reference that text through `aria-describedby`, and SHALL
stay reachable by keyboard so a screen reader reaches that reference. A
control the native `disabled` attribute switches off takes no focus, so its
description reaches nobody. The control SHALL therefore carry
`aria-disabled="true"` and SHALL send no publish request when activated.

A draft with no step yet SHALL render Publish unavailable the same way,
whatever its `canPublish` reads. Its visible reason SHALL say that publishing
needs a first step. That reason SHALL take the muted tone the permission
reason takes, and the same `aria-describedby` and `aria-disabled` binding.
Where the caller also lacks the permission, the permission reason SHALL
render alone. The permission answer comes first.

This client-side check only decides what the screen renders. The publish
route SHALL stay gated server-side whatever the browser decides, exactly as
this capability's own routing requirement states. A client that skips the
check still receives the same authorization error.

#### Scenario: A developer without the publish permission sees an unavailable control

- **WHEN** a draft loads with `canPublish: false`
- **THEN** the Publish control renders with `aria-disabled="true"`
- **AND** it is not removed from the screen
- **AND** activating it sends no publish request

#### Scenario: The unavailable control states its reason

- **WHEN** the Publish control renders unavailable for want of the publish
  permission
- **THEN** visible text beside it states that the account lacks the publish
  permission for this process
- **AND** the control references that text through `aria-describedby`
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** the control still takes keyboard focus, so that reference is read

#### Scenario: A permitted actor sees an available control

- **WHEN** a draft loads with `canPublish: true`
- **AND** the draft holds at least one step
- **THEN** the Publish control renders available, unchanged from today

#### Scenario: The frontend check is not the control

- **WHEN** a client that skipped the screen's check posts
  `POST /drafts/:processId/publish` for an actor the permission refuses
- **THEN** the engine still answers with the authorization error

#### Scenario: A draft with no step renders Publish unavailable

- **WHEN** a draft loads with `canPublish: true` and no step
- **THEN** the Publish control renders with `aria-disabled="true"`
- **AND** visible text beside it says that publishing needs a first step, in
  the muted tone
- **AND** the control references that text through `aria-describedby`
- **AND** activating it sends no publish request and opens no dialog

#### Scenario: The permission reason wins over the missing step

- **WHEN** a draft loads with `canPublish: false` and no step
- **THEN** the visible reason names the publish permission alone

#### Scenario: The first step makes Publish available

- **WHEN** an author adds the first step to a draft whose `canPublish` reads
  true
- **THEN** the Publish control renders available, with no `aria-disabled`
