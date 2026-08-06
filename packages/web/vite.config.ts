import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production-only: `@vitejs/plugin-react` injects the react-refresh preamble
 * as an inline script in dev, which `script-src 'self'` would forbid. A dev
 * origin holds a dev token against a dev database, so it is out of scope.
 * `connect-src` is derived from `VITE_API_URL` so the policy matches whatever
 * origin this build actually calls; unset means same-origin (`'self'`).
 *
 * No `frame-ancestors` here, and no `report-uri` or `sandbox` either. A browser
 * honors those three only in an HTTP response header and ignores them in a
 * `<meta http-equiv>`, so one here would read as protection and give none. The
 * framing rule now ships as a response header from both paths that serve this
 * bundle: `SECURITY_HEADERS` in `src/http/static.ts` for the engine, and the
 * `add_header` directives in `docker/nginx.conf` for the frontend image. That
 * header carries `frame-ancestors` alone, so the two policies restrict disjoint
 * directives and a browser enforcing both breaks no page.
 */
export function contentSecurityPolicy(): Plugin {
  const connectSrc = process.env.VITE_API_URL ? `'self' ${process.env.VITE_API_URL}` : "'self'";
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "csp-meta-tag",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" as const }];
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 5173, strictPort: true },
});
