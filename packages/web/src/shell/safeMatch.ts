/**
 * Wraps an area's route matcher so a malformed address cannot throw out of it.
 * `decodeURIComponent` throws a `URIError` on a malformed escape such as
 * `%E0%A4%A`; the wrapper returns `fallback` for that error alone and rethrows
 * every other one. Pure, with no React import, so the area routers stay
 * readable without React.
 */
export function safeMatch<R>(match: (path: string) => R, fallback: R): (path: string) => R {
  return (path) => {
    try {
      return match(path);
    } catch (error) {
      if (error instanceof URIError) return fallback;
      throw error;
    }
  };
}
