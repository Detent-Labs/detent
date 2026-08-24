/** A key: lower-cased, every run of characters outside `[a-z0-9]` collapsed to
 * a single `_`, with a leading/trailing `_` trimmed — the shape the
 * definition contract's identifier grammar (`/^[a-z_][a-z0-9_]*$/`) already
 * requires of a published `FieldDef.key` (design.md: "One shared
 * `deriveKey`/`dedupeKey` pair"). A result starting with a digit gains a
 * leading `_`, since the grammar requires the first character to be a letter
 * or `_`. Can come out empty for a label with no `[a-z0-9]` characters at
 * all. */
export function deriveKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[0-9]/.test(slug) ? `_${slug}` : slug;
}

/** `base`, or `base` with a `_2`, `_3`, … suffix appended until the result is
 * not in `taken`. */
export function dedupeKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Whether a label edit should still overwrite `currentKey`: true while the
 * key is empty (never touched) or still reads exactly as the prior label's
 * derivation (never hand-edited since). False the moment an author has typed
 * anything else into the key field — design.md's "Lock detection compares
 * against the previous derivation, not a stored flag". */
export function shouldAutoDeriveKey(currentKey: string, previousLabelDerivedKey: string): boolean {
  return currentKey === "" || currentKey === previousLabelDerivedKey;
}
