<!-- antislop: allow-file synonym-rotation sentence-length passive-voice run-ons -->
<!-- Why: a strategy, a picker and a config name three different things here. The linter also merges sentences around code spans, and "is set" names a prop state. -->

# Design

## Context

See `proposal.md` for the motivation. The critique snapshot sits at `.impeccable/critique/2026-11-04T18-18-44Z__packages-web-src-areas-studio-panels-steppage-tsx.md`.

Who acts renders `PluginEnvelopeEditor`, the one editor for every `{ type, config }` position. Three facts shape this design.

- The editor keeps `value?.config` across a type change, and `GeneratedField` rewrites a string list from its parsed array on each key.
- `GET /admin/groups` admits `system:admin` alone, so a process author cannot read group names today. No studio control edits `allowedGroups`.
- `allowedGroups` has two readers: the compile check on `org.group-members`, and every bare person field's picker. The authoring guide states this, and `examples/access-request.json` relies on it.

The studio has no Zod schema, only the descriptors `GET /registry` sends. The `studio-checks-rail` requirement "Publishing keeps two checks the studio cannot run" rests on that. `src/validate.ts` runs the config check only when `publishBody` supplies registries.

## Shape brief

The owner confirmed this brief on 2026-11-04.

- **Job:** a process author finishes authoring all four strategies with no id and no JSON, and trying an option cannot damage the draft.
- **Layout:** the strategy select stays until the second change, with "Nobody in particular" as its first option. An empty step shows the select alone.
- **Pickers:** each is one self-contained control: label above, `StudioSelect`, and an error as a sibling of the label. A radio row can take it unchanged.
- **Inline creation:** "Add a person field" takes a name in place. It never places the field on a form, since it cannot know which step should ask.
- **Anti-goals:** no side inspector, no visible id, no machine chip, no modal for the inline name.

## Goals / Non-Goals

**Goals:**

- All four strategies finish authoring on the no-code path. The person-field strategy's participant side still needs an `allowedGroups` entry on a process with no group step. `docs/decisions.md` records that for the second change.
- A strategy switch leaves no key in the draft that the current type does not own.
- The header, the Checks tab and the Publish dialog agree with what a publish does for a who-acts config.

**Non-Goals:**

- The radio list, the plugin-form field stack and the rewritten notes. The second change takes them.
- The warning on automatic steps, and the end step's section list.
- A token picker over known roles and accounts for the fixed list.
- An `allowedGroups` editor, and reconciling that list when a step is removed.
- Config checks for actions and data sources, which stay held back.
- Any change to `src/schema/definition.ts`.

## Decisions

**D1. Text state for a string list follows the raw JSON idiom.** A new `shownLines(edit, stored)` in `pluginConfigText.ts` mirrors `shownConfig`: the text counts while the stored list is the one it parsed to. A `LinesInput` component in `panels/shared/` holds the edit state and is the only string-list textarea. The draft updates on each key, so autosave and Checks stay live. A caller's caption that states the rule stands as the visible label above the control. It replaces the hint and serves as the description target, so the fixed list prints its rule once.

Parsing on blur was the alternative. It leaves the draft stale while the author types, and a Fix or a section change could skip the commit.

**D2. A type change writes `{}`, and the editor remembers the old config.** `PluginEnvelopeEditor` keeps a `useRef<Record<string, unknown>>` keyed by type. A change stores the outgoing config and writes the remembered config for the new type, or `{}`. `description` stays. The ref is per mount, and the existing "An entity editor mounts per entity" rule scopes it.

The switch logic is pure and lives in `pluginConfigText.ts`: `switchedConfig(memory, value, nextType)` and `memoryAt(memory, seenGeneration, generation)`. `packages/web/test` has no DOM library, so `bun:test` reads these two, and the browser check presses the control.

A type change also clears `edit`, so invalid text typed against one type cannot stand on the next. The memory clears when `loadGeneration` moves, so a restore or a JSON Apply cannot bring back an older config. The editor reads that through the draft context and treats no provider as no clearing.

A confirmation was the alternative. It charges every exploratory click for a rare loss. The rule applies at all three registry positions, since an action's stale key fails the same way.

**D3. The envelope gains a `noneOption` prop.** The prop holds `{ label, onChoose }`. When it is set, the select's first option reads the label and `onChoose` runs on it, and no config control and no Description stand while `type` is empty. A stored `type: ""` renders the existing `plugin.selectType` text as a separate option with its own value, so "Nobody in particular" stays pickable. Other positions pass no prop and keep their behavior.

Choosing the none option stores the outgoing config and description under its type before `onChoose` runs. While `noneOption` is set the editor always draws the select and never the free-text input. With no `registryTypes` the select holds the none option and any held type, read through `typeLabel`, with no unregistered mark, since nothing has said the type is unknown. The JSON surface stays the way out on a failed registry read.

**D4. `customConfigEditor` becomes `customConfigEditors`.** The prop becomes a record keyed by type, since Who acts needs three entries. `DataSourcesPanel` moves to the record form. The manager strategy keeps its empty generated form. `validateField` gains a wrong-kind branch: a non-empty value that is not an array, on a `string-array` descriptor, returns `plugin.notAList`, reading "Enter one value per line." The generated form gains the same error, which the base requirement already asks for. The fixed-list editor passes its own descriptor, `{ key: 'candidates', kind: 'string-array', required: true }`, so the error stands with no registry. The base requirement "A purpose-built form serves the instance.query data source type" says every other type keeps its path, so the delta modifies it.

**D5. One module owns the who-acts writes.** `draft/assignmentWrites.ts` exports pure functions over a draft: `pickGroup`, `pickPersonField`, `addPersonField`, `changeStrategy`, `clearAssignment`, each run inside one `mutate`. `StepPage` routes the envelope's `onChange` through `changeStrategy` when `type` differs, and writes directly when only `config` or `description` moves. So a raw JSON keystroke cannot remove a list entry on a half-typed value.

`changeStrategy` also adds `next.config.groupId` to `allowedGroups` when the next type is `org.group-members` and that value is a non-empty string, in the same write as any drop. So a switch away and back restores the entry along with the config, and the draft compiles again. An id typed through JSON joins the list the same way. The picker marks it not offered, and publish refuses it. `addPersonField` takes a field minted outside the recipe, as `mintAndPlace` does, since `mintId` is random and a recipe stays pure.

**D6. The list rule.** `dropUnreadGroup(draft, stepId, groupId)` removes the id when no other step's `org.group-members` strategy names it and no bare person field exists. It reads the tree through `flattenDraftFields`, so a nested field counts. `pickGroup` skips the drop when the old and new ids match, and in every write the add runs last. An emptied list deletes the key, which keeps the body's hash the same as one that never had the list.

The owner chose this over add-only and over always-remove on 2026-11-04. Add-only strands an entry only JSON can remove. That entry can block a later publish when the group's scope narrows. Always-remove can shrink a person field's picker with no sign to the author.

**D7. The new route lives beside the draft routes.** `listGroupsPermitting(processId, db)` in `src/auth/groups.ts` runs this statement, proven in a probe on 2026-11-04:

```sql
SELECT group_id, name FROM groups
WHERE scope->>'type' = 'global'
   OR (scope->>'type' = 'processes' AND scope->'processIds' @> to_jsonb(${processId}::text))
ORDER BY name, group_id
```

On the two shapes `groupScope` admits, the statement and `validateGroupScope` agree. Only a hand-edited row holds a malformed scope. The route omits such a row, so it can stand stricter than publish there.

`handleListAssignableGroups` reuses `draftGate`, the gate of `handleGetDraft`. The handler answers 404 on `getDraft`, as `handleGetDraft` does. `StepPage` gains a required `processId: string` prop from `EditScreen`'s `ProcessSurface`.

`useAssignableGroups` lives in `GroupPicker` and keeps the pattern of `useChildInputFields`, with no idle state and a `message` from `describeCaughtError(err)`. A pure `assignableGroupsFor(result)` holds its reading, as `childInputsFor` does. `useFetchOnce` swallows a failure and would read as loading forever.

Widening `GET /admin/groups` was the alternative. It would hand every member list to every author. The route returns no page cursor. A `ponytail:` comment names that ceiling: a deployment's group count stays small, and a cursor is the upgrade.

**D8. A closed schema reads from `{ io: "input" }`.** `isClosedConfigSchema` reads `z.toJSONSchema(schema, { io: "input" }).additionalProperties === false`. The default output mode reports `false` for a plain `z.object` too. A probe on 2026-11-04 measured these values: plain output `false`, input `undefined`; strict `false` in both; loose `{}` in both. Reading the default would mark `static` closed and raise false blockers.

`z.toJSONSchema` throws on some schemas, `z.date()` among them, so a throw reads as not closed and `GET /registry` still answers. `closedAssignmentStrategyTypes` is a sibling of the descriptor maps, so the descriptor array shape and its tests stay as they are.

**D9. The client check mirrors the server's verdict and nothing more.** `draft/assignmentConfig.ts` exports `assignmentConfigGaps(strategy, schemas, closed)`. It returns one gap per absent required key, value of the wrong kind, or unknown key on a closed type.

`runValidation` pushes each as a `registry` issue at `workflow.steps[<i>].assignment.strategy.config`, so the existing `propertyRule` picks `checks.assignment.config`. `tokenize` reads only the bracket form, and a dotted index falls to the process-level fallback.

The check runs inside the `if (registry)` branch, which itself runs only on a compiled body. A draft with a structural issue elsewhere therefore shows no config row yet. That gate also keeps this check and the compile checks from flagging one step twice. A kind switch to a call keeps the step's `assignment` and leaves no Who acts section, so every who-acts sentence aims at the JSON surface on such a step. Removing `assignment` on that switch is the cleaner end, and `docs/decisions.md` records it for the second change.

The parameter widens to `RegistryDescription & Partial<Pick<RegistryInfo, 'assignmentStrategySchemas' | 'closedAssignmentStrategyTypes'>>`, and an absent field reads as no description. The `registryConfig` dimension stays at `not-run`, since actions and data sources stay held back. An empty list and an empty string raise no gap here. The server accepts the first. The compile check already reports the second.

**D10. Header state.** `SummaryInput` gains optional `assignmentSchemas` and `closedAssignmentTypes`. `StepPage` reads them from the draft context's registry, which holds from the provider's mount. The page's own `useRegistry` remounts per step and starts empty.

`sectionSummary` reads `held ? (holds ? 'done' : 'todo') : needed ? 'todo' : 'optional'`, so a held but incomplete strategy reads `todo` on every step kind that stands Who acts. `defaultOpenSection` reads the same state, so that strategy opens Who acts on an automatic step or an end step, and the delta modifies the base requirement to say so.

With no descriptor `assignmentConfigHolds` passes, whatever the config holds. A plugin strategy therefore keeps reading Done on its type. With a descriptor, a config that is not a plain object fails and never throws, since raw JSON can store `null`. The helper adds the empty-value test to D9's gaps, so an emptied list reads "To do" with no issue. `SectionMark` already prefers the count, so the open check shows first.

**D11. Copy.** Each string has one catalog key in `i18n/catalogs/studio.ts`, in English only, as the studio ships.

| Key | Text |
|---|---|
| `whoActs.listCaption` | People or roles, one per line |
| `whoActs.groupCaption` | Group |
| `whoActs.groupChoose` | Choose a group |
| `whoActs.groupsLoading` | Loading groups… |
| `whoActs.groupsEmpty` | No group is open to this process yet. An operator adds one on the admin Groups screen. |
| `whoActs.groupNotOffered` | {id} (not offered to this process) |
| `whoActs.groupAlsoPeople` | This process's people pickers offer this group too. |
| `whoActs.fieldCaption` | Field that names the person |
| `whoActs.fieldChoose` | Choose a field |
| `whoActs.fieldSeveral` | {label} (holds several people) |
| `whoActs.fieldSeveralNote` | A field holding several people reaches nobody. Choose one that holds one person. |
| `whoActs.fieldUnwritten` | Nothing in this process writes this field before this step, so it reaches nobody until an earlier form asks for it. |
| `plugin.notAList` | Enter one value per line. |
| `whoActs.addField` | Add a person field |
| `whoActs.addFieldName` | Name of the new field |
| `whoActs.addFieldConfirm` | Add |
| `checks.assignment.group` | “{step}” names a group this process may not use. Under {section}, choose a group. |

`checks.assignment.noSection` reads “{step}” still holds a who-acts setting that does not pass. Correct it in the JSON surface. Two strings reuse an existing key: "Nobody in particular" reads `assignment.none`, and the inline control's Cancel reads `dialog.cancel`.

**D12. The field-written note reuses the structural writers.** `view-flags.ts` exports `structuralWriterIds`. `draft/assignmentConfig.ts` adds `fieldHasWriter(draft, fieldId, stepId)`. It counts `structuralWriterIds` over the draft with the assigned step removed, any `default`, and an entry on another step with `visible !== false` and `readonly !== true`. `applyFieldDefaults` seeds a literal and an expression alike, so both count. An entry or an action on the assigned step does not count, since the strategy reads the field at step entry, before either lands. The note stands only while the picker shows a chosen single-person field. A later step on a loop still counts, so this warns about no writer at all and proves no order. `writtenFieldCounts` is the upgrade for a stricter reading.

## Risks / Trade-offs

- [A picked group changes a participant's choices. A bare person field with an empty list takes any id. With one entry it binds to that group.] → The note under the picker names the effect. `docs/authoring-guide.md` states it too.
- [A bare person field on a process with no `allowedGroups` offers nobody. The inline control can create one.] → This gap predates the change. The unwritten-field note covers the first stall. `docs/decisions.md` records the missing `allowedGroups` control for the second change, and the plain text input a participant then meets.
- [`groupsLoading` shows a line each time the picker mounts.] → One hook fetches once per picker mount, so a switch back fetches again.
- [A `process.start` mapping or an API start can seed a field from outside this body. The note cannot see that, and reads as if nothing writes it.] → The note blocks nothing. A field on `contract.inputFields` clears it.
- [A descriptor holds the supported subset only. The client check misses a bound such as `minLength`.] → The server stays the gate. The Developer line "held back" stays true. The new check flags only what a publish refuses, with one exception: a schema that coerces its input can read wrong-kind here. No shipped strategy does.
- [A step removal leaves its group in `allowedGroups`.] → This stays out of scope. The entry stays harmless until a scope narrows, and the check names it then.
- [The new pickers sit inside an unstyled envelope. The section looks mixed until the second change.] → The owner accepted bugs first. The second change styles the envelope.

## Migration Plan

Nothing deployed needs moving. A draft with a stale key or an empty type now shows a Must fix row. The section offers the repair. Rollback is a revert: the route and the registry field have no other reader.

## Open Questions

None.
