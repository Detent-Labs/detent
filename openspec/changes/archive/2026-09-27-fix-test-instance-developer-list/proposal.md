# Proposal

## Why

`POST /drafts/:processId/instances` checks only for the author or developer role. It does not check the process's Developer list.

Each process has one shared draft. So an author who is not on a process's Developer list can start a test run of that team's draft.

The test run then shows the attacker the draft's steps, forms and fields. `GET /drafts/:processId` refuses the same attacker with 403.

The test run also fires the draft's actions for real, with seed data the attacker picks. A security review found this gap on 2026-09-27.

The live spec already asks for the same standing as a draft read. Its scenarios test roles only, which is how the gap got through.

## What Changes

- `POST /drafts/:processId/instances` takes the same gate as `GET /drafts/:processId`.
- A process can have a draft or a published version. Then the actor must be on its Developer list or have the admin role.
- An admin without an authoring role now passes, the same exception the three sibling draft routes make.
- A process with no draft and no published version keeps today's answer: the authoring-role check, then 404.
- The `draft-test-instances` spec gets scenarios for an unlisted actor and for an admin.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `draft-test-instances`: one requirement now names the Developer list and the admin exception. It gets a scenario for each.

## Impact

- `src/http/studio-routes.ts`: the gate and the doc comment of `handleCreateTestInstance`.
- `test/http-studio.test.ts`: new route tests for an unlisted author, an unlisted developer and an admin.
- No change to the definition contract, the schema or the web package. An unlisted user who opens the Player by URL now gets a 403. The Player already shows that error, as it does for a bystander.
