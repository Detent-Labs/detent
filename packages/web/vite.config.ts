import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";

const appVersion = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();

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
  plugins: [
    // Ahead of plugin-react, as the StyleX docs order them. `rootDir` is the
    // workspace root so a `.stylex.ts` file under either package resolves.
    stylex({ unstable_moduleResolution: { type: "commonJS", rootDir: fileURLToPath(new URL("../..", import.meta.url)) } }),
    react(),
    contentSecurityPolicy(),
  ],
  // server.port is the in-container listening port, fixed at 5173 always.
  // hmr.clientPort is the browser-visible port — this checkout's derived
  // PORT_VITE, published to the host by scripts/worktree-env.sh — so the
  // HMR websocket reconnects at the address the host actually reached.
  server: { port: 5173, strictPort: true, hmr: { clientPort: Number(process.env.PORT_VITE) || 5173 } },
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // Chrome.tsx's account menu uses the Popover API (`beforetoggle`, for JS
  // positioning): Chrome 114+, Safari 17+, Firefox 125+. Vite's default
  // target (esbuild's `baseline-widely-available`, roughly Chrome 107/Safari
  // 16/Firefox 104) predates that floor, so it must be named explicitly.
  build: { target: ["chrome114", "safari17", "firefox125"] },
});
