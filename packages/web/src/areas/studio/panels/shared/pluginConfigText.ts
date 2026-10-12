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
