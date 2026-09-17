export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

export function moveTo<T>(list: T[], from: number, to: number): T[] {
  // Clamp to into the valid range [0, list.length - 1]
  const clampedTo = Math.max(0, Math.min(to, list.length - 1));

  // No-op if indices are the same or from is invalid
  if (from === clampedTo || from < 0 || from >= list.length) {
    return list;
  }

  const result = [...list];
  const item = result.splice(from, 1)[0];
  result.splice(clampedTo, 0, item);
  return result;
}
