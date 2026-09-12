import { fieldKindOf, type FieldKindName } from "workflow-engine/schema";
import {
  AtSign,
  Braces,
  Calendar,
  CalendarClock,
  CircleDot,
  DecimalsArrowRight,
  Folder,
  Hash,
  List,
  ListChecks,
  Paperclip,
  Puzzle,
  SquareCheck,
  TextAlignStart,
  ToggleLeft,
  Type,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { t } from "../catalog.js";

/**
 * One friendly name and a short note per entry of the engine's `FIELD_KINDS`
 * table. The kind picker and the catalog rail's row both call this, so neither
 * can name a different word for the same field (design.md, decision: field
 * kind).
 *
 * A function, not a record: `t` reads a deployment's stored override on every
 * call, and a record built at module load would freeze the values before the
 * override store answers (`ui-string-overrides`).
 *
 * Exhaustiveness survives that move. `CatalogKey` is a closed union, so the
 * template literal below resolves to one key per `FieldKindName`. A kind the
 * engine adds and the catalog misses is a compile error here.
 *
 * Display layer only. The picker writes the raw `{type, format, control}`
 * members the engine entry names, and the definition serializes unchanged.
 */
export function fieldKindLabel(kind: FieldKindName): { name: string; note: string } {
  return { name: t(`fieldKind.${kind}.name`), note: t(`fieldKind.${kind}.note`) };
}

/**
 * The one branch a declared field falls into, shared by `fieldKindWord` and
 * `fieldKindIcon` so neither can read a field's kind differently from the
 * other (design.md, decision: "One icon per kind, through the branches
 * `fieldKindWord` already takes"). Stays private: a caller outside this file
 * wants the word or the icon, never the branch itself.
 */
type FieldKindBranch =
  | { readonly kind: "named"; readonly name: FieldKindName }
  | { readonly kind: "plugin" }
  | { readonly kind: "unmatched" };

function classifyField(field: { type?: unknown; format?: unknown; control?: unknown }): FieldKindBranch {
  if (typeof field.type === "object" && field.type !== null) return { kind: "plugin" };
  const name = fieldKindOf(field);
  if (name !== undefined) return { kind: "named", name };
  return { kind: "unmatched" };
}

/**
 * The one word a surface prints for a declared field — the rail row's word
 * and the word the kind picker shows as selected (task 7.3). Both read
 * `fieldKindOf` and `fieldKindLabel`, so a `{type: "string", format: "date"}`
 * field reads "Date" in the rail and "Date" in the picker.
 *
 * Three answers, the same three the picker offers. A plugin envelope takes
 * the picker's own custom-type word. A triple the curated table names no kind
 * for takes the raw triple, which is a machine value and therefore mono at
 * the call site, never a translated word. Everything else takes its kind's
 * name.
 */
export function fieldKindWord(field: { type?: unknown; format?: unknown; control?: unknown }): string {
  const branch = classifyField(field);
  if (branch.kind === "plugin") return t("fieldCatalog.customTypeOption");
  if (branch.kind === "named") return fieldKindLabel(branch.name).name;
  return [field.type, field.format, field.control].filter((m) => typeof m === "string").join(" / ");
}

/**
 * The icon a Fields rail row leads a field's label with (design.md, decision:
 * "One icon per kind"). One icon per `FieldKindName`, plus one for a plugin
 * envelope and one for a triple no kind names — the same three branches
 * `fieldKindWord` answers, through the shared `classifyField` helper above.
 *
 * The lookup is a `Record`, so a `FieldKindName` the engine adds and this
 * table misses fails `bun run typecheck` rather than falling back silently at
 * runtime.
 */
export function fieldKindIcon(field: { type?: unknown; format?: unknown; control?: unknown }): LucideIcon {
  const branch = classifyField(field);
  if (branch.kind === "plugin") return Puzzle;
  if (branch.kind === "named") return FIELD_KIND_ICONS[branch.name];
  return Braces;
}

const FIELD_KIND_ICONS: Record<FieldKindName, LucideIcon> = {
  text: Type,
  longText: TextAlignStart,
  radioChoice: CircleDot,
  date: Calendar,
  dateTime: CalendarClock,
  email: AtSign,
  person: User,
  number: DecimalsArrowRight,
  wholeNumber: Hash,
  yesNo: SquareCheck,
  yesNoRadio: ToggleLeft,
  multiChoice: List,
  checkboxChoice: ListChecks,
  people: Users,
  file: Paperclip,
  group: Folder,
};
