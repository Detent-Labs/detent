# Proposal

## Why

A process author cannot finish two of the four Who acts strategies without JSON. Plugin config is on the list of what the builders cover. The default strategy also corrupts a second name as the author types it. Trying another strategy plants a publish refusal the draft cannot show. The critique of 2026-11-04 scored the section 14 of 40 and ranked these as its worst findings.

## What Changes

- The fixed-list control keeps the author's text, so Enter and spaces survive. The fix reaches every string-list config in the studio.
- A strategy change clears the old config from the draft. The editor holds it, so a switch back in the same editing session restores it.
- "Nobody in particular" becomes a real choice that removes the assignment. An empty section shows no JSON box and no Description.
- The author chooses a group by name and a person field by label. The group picker also keeps the process's `allowedGroups` list. The author never needs that list.
- The person-field picker can add a person field inline. A note warns while nothing writes the chosen field, because an unwritten field reaches nobody.
- The studio checks a who-acts config against the registry's description. The Publish dialog then counts a refused config as an open issue. The section header reads Done only when the config holds.
- A new route lists the groups open to one process for an author.
- `GET /registry` also names the strategies that refuse an unknown config key.

This change leaves the definition contract alone. It does not add a `ProcessBody` key or a schema rule.

A second change takes the radio list, the plugin-form field stack and the rewritten strategy notes. It also takes the warning on automatic steps, and it decides the `allowedGroups` control this change records. The new pickers are single controls, so a radio row can take them unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-plugin-config-form`: a string list keeps its text, and a type change clears the config. Three curated strategies leave the generated form, and `GET /registry` names the closed ones.
- `studio-step-page`: the way back to no assignment, the two pickers, the inline person field, and the Who acts header state.
- `studio-checks-rail`: the studio runs the who-acts config check, and a clear rail predicts it. A group outside the process's list lands on Who acts.
- `group-administration`: an author can list the groups open to one process.
- `authorization`: the gate on that route.

## Impact

- **Studio:** under `packages/web/src/areas/studio/`, `panels/shared/PluginEnvelopeEditor.tsx`, `panels/shared/pluginConfigText.ts`, `panels/StepPage.tsx`, `panels/stepSummaries.ts`, `panels/DataSourcesPanel.tsx`, `screens/EditScreen.tsx`, `draft/validation.ts`, `draft/checkSentence.ts`, `draft/checksRail.ts`, `draft/view-flags.ts`, `api/client.ts`, `api/types.ts`, and new picker and logic modules. Also `packages/web/src/i18n/catalogs/studio.ts`.
- **Engine and HTTP:** `src/auth/groups.ts`, `src/engine/config-descriptor.ts`, `src/http/studio-routes.ts`, `src/http/server.ts`.
- **Docs:** `docs/authoring-guide.md`, `docs/browser-checks.md`, `docs/decisions.md`, `docs/current-state.md`. The `drafts/*` routes stay outside `docs/openapi.yaml`, which excludes them by name.
- **Participants:** a group the picker adds also reaches any bare person field's picker, since one list serves both readers. The section says so when that applies.
