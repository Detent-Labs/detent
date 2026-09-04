import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";
import { contentSecurityPolicy } from "./csp.js";

const appVersion = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();
const outDir = fileURLToPath(new URL("dist", import.meta.url));

/**
 * A silent chunking regression (a stylesheet the entry no longer links, or
 * `cssInjectionTarget` pointed at the wrong file) must fail the build, not
 * ship an unstyled pilot. Reads the stylesheet `dist/index.html` actually
 * links and checks for the header's compiled `clip-path`. Grepping the
 * prefix, not the full declaration: lightningcss normalizes `0.4rem` to
 * `.4rem`.
 */
function assertCompiledStylesLinked(): Plugin {
  return {
    name: "assert-compiled-styles-linked",
    apply: "build",
    closeBundle() {
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      const match = html.match(/<link rel="stylesheet"[^>]*href="\/?([^"]+\.css)"/);
      if (!match) throw new Error("assert-compiled-styles-linked: dist/index.html links no stylesheet");
      const cssFile = match[1];
      const css = readFileSync(join(outDir, cssFile), "utf8");
      if (!css.includes("clip-path: polygon(")) {
        throw new Error(`assert-compiled-styles-linked: ${cssFile} carries no compiled StyleX rule (checked for "clip-path: polygon(")`);
      }
      console.log(`assert-compiled-styles-linked: verified ${cssFile}`);
    },
  };
}

export default defineConfig({
  plugins: [
    // Ahead of plugin-react, as the StyleX docs order them. `rootDir` is the
    // workspace root so a `.stylex.ts` file under either package resolves.
    // `cssInjectionTarget` names the entry stylesheet by output filename, so
    // compiled rules land beside `main.tsx`'s own CSS, never a lazy chunk's.
    // `useCSSLayers` stays unset (false): `global.css` still holds unlayered
    // rules, and a layered component rule would lose to them (web-styling's
    // "Layers stay off" requirement).
    stylex({
      unstable_moduleResolution: { type: "commonJS", rootDir: fileURLToPath(new URL("../..", import.meta.url)) },
      cssInjectionTarget: (filepath) => /\bindex-[^/\\]*\.css$/.test(filepath),
    }),
    react(),
    contentSecurityPolicy(),
    assertCompiledStylesLinked(),
  ],
  // server.port is the in-container listening port, fixed at 5173 always.
  // hmr.clientPort is the browser-visible port — this checkout's derived
  // PORT_VITE, published to the host by scripts/worktree-env.sh — so the
  // HMR websocket reconnects at the address the host actually reached.
  server: { port: 5173, strictPort: true, hmr: { clientPort: Number(process.env.PORT_VITE) || 5173 } },
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // `form-ui` resolves through node_modules (the workspace linker), so
  // Vite's dependency scanner treats it as pre-bundlable and hands
  // `tokens.stylex.ts` to esbuild before the StyleX plugin ever sees it,
  // throwing "Unexpected 'stylex.defineVars' call at runtime" in dev.
  // Excluding it keeps every `form-ui` import on Vite's own transform
  // pipeline, where the StyleX plugin runs.
  optimizeDeps: { exclude: ["form-ui"] },
  // Chrome.tsx's account menu uses the Popover API (`beforetoggle`, for JS
  // positioning): Chrome 114+, Safari 17+, Firefox 125+. Vite's default
  // target (esbuild's `baseline-widely-available`, roughly Chrome 107/Safari
  // 16/Firefox 104) predates that floor, so it must be named explicitly.
  build: { target: ["chrome114", "safari17", "firefox125"] },
});
