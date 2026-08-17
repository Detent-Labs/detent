/**
 * The `templates` table: a reusable authored body a new process seeds from.
 * The stored body is the authored (uncompiled) shape and is never parsed
 * against `processBody` — only its envelope is checked, the same rule
 * `drafts.ts` applies and for the same reason: a template seeds a draft, and a
 * draft under construction routinely violates the authoring-time invariants.
 * A stricter check here would create a body an author can save as a draft but
 * not as a template.
 *
 * Unlike a draft, a template carries no revision. Optimistic concurrency
 * answers two editors holding one canvas; a template faces no such contention,
 * so a conflict path here would be one nobody reaches.
 *
 * A template is a snapshot, not a dependency: nothing records which process
 * came from which template, and editing one changes no draft already seeded
 * from it.
 */
import type { SQL } from "bun";
import { sql } from "./store.js";
import { checkJsonEnvelope, parseJsonb } from "./drafts.js";
import { RequestShapeError } from "../errors.js";

export type Template = {
  templateKey: string;
  body: unknown;
  layout: Record<string, unknown>;
  createdBy: string;
  updatedAt: string;
};

/**
 * What the list route carries. Deliberately no body: a body may reach
 * `MAX_DRAFT_ENVELOPE_BYTES`, so a list of every body would answer the picker
 * with megabytes it never reads. `listDrafts` draws the same line.
 *
 * `label` and `description` are projected out of the body rather than stored
 * beside it, so the table holds one copy of each and nothing can drift.
 */
export type TemplateSummary = {
  templateKey: string;
  label: unknown;
  description: unknown;
  createdBy: string;
  updatedAt: string;
};

export type SaveTemplateInput = {
  body: unknown;
  layout: unknown;
  createdBy: string;
};

/** The key appears in a URL path segment, so it stays a plain slug. */
const TEMPLATE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_TEMPLATE_KEY_LENGTH = 128;

type TemplateRow = {
  template_key: string;
  body: unknown;
  layout: unknown;
  created_by: string;
  updated_at: string | Date;
};

type SummaryRow = Omit<TemplateRow, "body" | "layout"> & { label: unknown; description: unknown };

function toTemplate(row: TemplateRow): Template {
  return {
    templateKey: row.template_key,
    body: parseJsonb(row.body),
    layout: parseJsonb(row.layout) as Record<string, unknown>,
    createdBy: row.created_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toSummary(row: SummaryRow): TemplateSummary {
  return {
    templateKey: row.template_key,
    label: parseJsonb(row.label) ?? null,
    description: parseJsonb(row.description) ?? null,
    createdBy: row.created_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function checkTemplateKey(key: string): void {
  if (key.length > MAX_TEMPLATE_KEY_LENGTH) {
    throw new RequestShapeError(`template key exceeds the ${MAX_TEMPLATE_KEY_LENGTH}-character bound`);
  }
  if (!TEMPLATE_KEY_PATTERN.test(key)) {
    throw new RequestShapeError(`template key must match ${TEMPLATE_KEY_PATTERN.source}`);
  }
}

function checkEnvelope(input: SaveTemplateInput): void {
  checkJsonEnvelope("template", input.body, input.layout);
}

export async function getTemplate(templateKey: string, db: SQL = sql): Promise<Template | undefined> {
  const rows = (await db`
    SELECT template_key, body, layout, created_by, updated_at
    FROM templates WHERE template_key = ${templateKey}
  ` as unknown) as TemplateRow[];
  return rows[0] ? toTemplate(rows[0]) : undefined;
}

/** One summary per template, newest-saved first, carrying no body. */
export async function listTemplates(db: SQL = sql): Promise<TemplateSummary[]> {
  const rows = (await db`
    SELECT template_key, body -> 'label' AS label, body -> 'description' AS description,
           created_by, updated_at
    FROM templates ORDER BY updated_at DESC
  ` as unknown) as SummaryRow[];
  return rows.map(toSummary);
}

/**
 * Upsert, not a revision-checked update: a second write under one key replaces
 * the first rather than reporting a conflict. `created_by` records who wrote
 * the row that stands, so it follows the body it describes.
 */
export async function saveTemplate(templateKey: string, input: SaveTemplateInput, db: SQL = sql): Promise<Template> {
  checkTemplateKey(templateKey);
  checkEnvelope(input);
  const { body, layout, createdBy } = input;
  const rows = (await db`
    INSERT INTO templates (template_key, body, layout, created_by, updated_at)
    VALUES (${templateKey}, ${body}, ${layout}, ${createdBy}, now())
    ON CONFLICT (template_key) DO UPDATE
      SET body = EXCLUDED.body, layout = EXCLUDED.layout,
          created_by = EXCLUDED.created_by, updated_at = now()
    RETURNING template_key, body, layout, created_by, updated_at
  ` as unknown) as TemplateRow[];
  return toTemplate(rows[0]!);
}

/**
 * Removes the row. Nothing pins a template — no process, draft or instance
 * references one — so this strands nothing, unlike a data list value.
 * Reports whether a template existed to delete.
 */
export async function deleteTemplate(templateKey: string, db: SQL = sql): Promise<boolean> {
  const rows = (await db`DELETE FROM templates WHERE template_key = ${templateKey} RETURNING template_key`) as unknown[];
  return rows.length > 0;
}
