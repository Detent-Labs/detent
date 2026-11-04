/**
 * The raw JSON textarea of a plugin envelope (`studio-plugin-config-form`,
 * "The raw JSON text follows the stored config"). The author's text counts
 * only while the stored config is the one it was typed against.
 */
export interface ConfigEdit {
  text: string;
  /** `JSON.stringify` of the stored config this text was typed against. */
  base: string;
  error: string | null;
}

/** The text and error line the textarea shows for the stored `config`. */
export function shownConfig(edit: ConfigEdit | null, config: unknown): { text: string; error: string | null } {
  const stored = config ?? {};
  if (edit !== null && edit.base === JSON.stringify(stored)) return { text: edit.text, error: edit.error };
  return { text: JSON.stringify(stored, null, 2), error: null };
}

/** The `base` of an edit whose text parsed to `parsed`. `shownConfig` reads a
 * stored `null` or absent config as `{}`, so the base reads it that way too:
 * the valid text `null` then stays shown as typed. */
export function parsedConfigBase(parsed: unknown): string {
  return JSON.stringify(parsed ?? {});
}

/** The text of a string-list control (`studio-plugin-config-form`, "A string
 * list keeps the author's text"). The author's text counts only while the
 * stored list is the one it parsed to. */
export interface LinesEdit {
  text: string;
  /** `JSON.stringify` of the stored list this text parsed to. */
  base: string;
}

/** The list one line per value holds: each line trimmed, blank lines dropped. */
export function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** The text the string-list textarea shows for the stored list. */
export function shownLines(edit: LinesEdit | null, stored: unknown): string {
  const list = Array.isArray(stored) ? stored : [];
  if (edit !== null && edit.base === JSON.stringify(list)) return edit.text;
  return list.join("\n");
}

/** What one registry type last held at a position: its config and, for the none option, its description. */
interface HeldPlugin {
  config: Record<string, unknown>;
  description?: string;
}

/** The held plugins of one editor mount, keyed by type. */
export type PluginMemory = Record<string, HeldPlugin>;

/** The memory in force at `generation`. A moved `loadGeneration` (restore, JSON Apply) empties it. */
export function memoryAt(memory: PluginMemory, seenGeneration: number, generation: number): PluginMemory {
  return seenGeneration === generation ? memory : {};
}

/**
 * The write for a type change. The outgoing config (and description) go into the
 * memory under the old type. The new type gets the config it last held, or `{}`.
 * The description stays; it is restored from the memory only where `value` holds none
 * (the none option removes the whole key).
 */
export function switchedConfig(
  memory: PluginMemory,
  value: { type?: string; config?: unknown; description?: string } | undefined,
  nextType: string,
): { memory: PluginMemory; config: Record<string, unknown>; description?: string } {
  const outgoing = value?.type ?? "";
  const next: PluginMemory = { ...memory };
  if (outgoing !== "") {
    const config = (value?.config ?? {}) as Record<string, unknown>;
    next[outgoing] = value?.description === undefined ? { config } : { config, description: value.description };
  }
  const held = next[nextType];
  const config = held?.config ?? {};
  const description = value?.description ?? held?.description;
  delete next[nextType];
  return description === undefined ? { memory: next, config } : { memory: next, config, description };
}
