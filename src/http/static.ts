/**
 * Static asset fallthrough for the HTTP wrapper. `createServer` calls
 * `serveWebAsset` at its terminal 404, behind every API route, so no URL
 * prefix is reserved for assets and a later API route needs no special case.
 * A `null` return means "declined": the caller then answers with today's JSON
 * 404 envelope, unchanged.
 *
 * Nothing here resolves an actor. A browser fetches the shell document and its
 * hashed assets before it holds a token, and the terminal 404 this branch sits
 * in front of resolves none either.
 *
 * Separate from `server.ts` so a test can call it with `new Request(...)` and a
 * fixture directory — no port, no build, no browser. See the
 * `web-asset-serving` capability.
 */
import { statSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

/** Safe because the build hashes asset filenames. `index.html` is the exception. */
const IMMUTABLE = "max-age=31536000, immutable";

/** The stat of `path` if it is a regular file, else null. A directory is not servable. */
function statFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve `pathname` under `root`, or null when it does not decode, escapes the
 * root, or names anything but a regular file.
 *
 * Containment is a whitelist: decode, resolve, then require the result to stay
 * under the root. Rejecting paths that *contain* `..` would be a blacklist and
 * would have to also cover `%2e%2e`, `%252e%252e` and every future encoding.
 */
function resolveContained(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const candidate = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return statFile(candidate) ? candidate : null;
}

function fileResponse(method: string, path: string): Response {
  const file = Bun.file(path);
  return new Response(method === "HEAD" ? null : file, {
    headers: {
      "content-type": file.type,
      // index.html keeps its name across builds and names the current asset
      // hashes; caching it immutably would pin a browser to one build forever.
      "cache-control": basename(path) === "index.html" ? "no-cache" : IMMUTABLE,
    },
  });
}

/**
 * True for a browser's top-level navigation — an address-bar load, a reload, a
 * followed link — and false for the `fetch`/XHR a page makes afterwards.
 *
 * This exists because an area's URL prefix can collide with an API prefix. The
 * admin area's `/admin/outbox`, `/admin/timers` and `/admin/users` screens have
 * exactly the paths of three `GET` admin routes, so "the API route always wins"
 * would answer a reload of those screens with `401` JSON instead of the shell.
 *
 * `Sec-Fetch-Mode: navigate` is sent by every current browser on a top-level
 * navigation and never on a page's own `fetch`. The `Accept` fallback covers a
 * client that sends no `Sec-Fetch-*` at all. An API caller that asks for HTML
 * gets the shell; that is the deliberate cost, and it is why the check is this
 * narrow rather than "any GET a browser could make".
 */
export function isNavigationRequest(req: Request): boolean {
  const mode = req.headers.get("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (req.headers.get("accept") ?? "").includes("text/html");
}

/**
 * Serve a file from under `root`, or `null` to decline.
 *
 * `GET`/`HEAD` only — every other method keeps the JSON 404. An unmatched path
 * falls back to `index.html` with status 200, which is what the browser History
 * API needs; a root with no `index.html` declines instead of masking the 404.
 *
 * No CORS headers: these assets are same-origin to the API by construction.
 */
export function serveWebAsset(req: Request, url: URL, root: string): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const base = resolve(root);
  const file = resolveContained(base, url.pathname);
  if (file) return fileResponse(req.method, file);
  const index = resolve(base, "index.html");
  return statFile(index) ? fileResponse(req.method, index) : null;
}

/**
 * The web root, or `undefined` when there is none to serve from — an absent
 * directory means `createServer` gets no static branch at all, and the engine
 * runs unchanged with no built frontend. That stays a supported configuration
 * because a reverse proxy may serve the assets instead.
 *
 * Resolved once, at the composition root, so the per-request path carries no
 * directory stat. Dropping a build in later needs a restart, like every other
 * deployment input to this process.
 *
 * The default points at `packages/web/dist`, which the unified shell produces.
 * Until it exists the default is inert, so no installation gets a surprise.
 */
export function resolveWebRoot(configured: string | undefined): string | undefined {
  // An empty or whitespace `WEB_ROOT` means "unset", never the process CWD:
  // `resolve("")` is the working directory, which would serve the whole tree.
  const named = configured?.trim() || undefined;
  const root = resolve(named ?? resolve(import.meta.dir, "../../packages/web/dist"));
  try {
    return statSync(root).isDirectory() ? root : undefined;
  } catch {
    return undefined;
  }
}
