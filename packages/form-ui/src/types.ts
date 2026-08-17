import type { BaseFieldType, Plugin, LocalizedText, FieldOption } from "workflow-engine/schema";

/**
 * Wire shapes for a step form — what a consumer gets back from the HTTP
 * wrapper's `getInstanceView`/`InstanceView`, over JSON, never the engine's
 * own in-process runtime types. Shared by every consumer (the editor's
 * Player, the end-user app) so a form renders identically everywhere.
 */

export interface WireField {
  id: string;
  key: string;
  label: LocalizedText;
  type: BaseFieldType | Plugin;
  options?: FieldOption[];
  dataSource?: string;
}

export interface ResolvedViewField {
  field: WireField;
  value: unknown;
  required: boolean;
  readonly: boolean;
  group?: string;
  options?: FieldOption[];
  /** How many of the form's columns this field occupies, as the engine
   * resolved it. Optional here because a hand-built fixture and an older
   * response both omit it; `FieldForm` reads an absent value as 1 and clamps
   * to the grid it renders. */
  span?: 1 | 2;
}

export interface AvailablePath {
  id: string;
  key: string;
  label?: string;
}

export interface SubmissionIssue {
  kind: string;
  fieldId: string;
  [key: string]: unknown;
}
