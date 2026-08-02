/**
 * The `"db.list"` picker's rules, kept out of React so they can be tested.
 *
 * A missing list is deliberately not an error here. Publishing does not read
 * the data list tables (`db-data-source-type`: "an identical re-publish stays a
 * no-op, whatever the tables hold"), so a key the server does not report cannot
 * be an invariant — only a warning. Nothing here produces an `EditorIssue`, so
 * nothing here reaches the publish path.
 */

/** The type whose `config.listKey` this picker fills. Matches `host.ts::DB_LIST_DATA_SOURCE_TYPE`. */
export const DB_LIST_TYPE = "db.list";

export function listKeyOf(config: unknown): string {
  const value = (config as { listKey?: unknown } | undefined)?.listKey;
  return typeof value === "string" ? value : "";
}

/**
 * The warning to show under a data source, or `undefined` for none.
 *
 * `knownKeys` is `undefined` while the keys have not arrived — the studio then
 * says nothing rather than warning about every key on a failed fetch.
 */
export function unknownListKeyWarning(type: string | undefined, config: unknown, knownKeys: readonly string[] | undefined): string | undefined {
  if (type !== DB_LIST_TYPE || knownKeys === undefined) return undefined;
  const listKey = listKeyOf(config);
  if (listKey === "" || knownKeys.includes(listKey)) return undefined;
  return `No data list '${listKey}' exists on this server. Publishing still works; the field's options stay empty until an operator creates it.`;
}

/** The keys to offer, with the draft's own key kept even when the server does not report it — so choosing does not silently drop it. */
export function keyOptions(current: string, knownKeys: readonly string[]): string[] {
  return knownKeys.includes(current) || current === "" ? [...knownKeys] : [current, ...knownKeys];
}
