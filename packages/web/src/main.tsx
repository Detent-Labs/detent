import { createRoot } from "react-dom/client";
import { App } from "./shell/App.js";
import { loadUiStringOverrides } from "./i18n/overrides.js";
import "./shell/tokens.css";
import "./shell/global.css";
import "./shell/shell.css";

// Dev only. The StyleX plugin appends compiled CSS to the built stylesheet,
// but in dev it serves that CSS at a virtual URL and injects nothing into
// `index.html`, so a converted component renders bare until this runtime
// links it. `import.meta.env.DEV` is a build-time constant, so the branch and
// the virtual module both drop out of a production bundle.
if (import.meta.env.DEV) void import("virtual:stylex:runtime");

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
// Awaited before the first render, not in an App effect: `resolveOverride`
// reads a module variable React does not observe, so installing the map after
// mount would schedule no re-render and the login screen would keep its builtin
// wording. A failed fetch resolves anyway and leaves the map empty.
//
// The await sits inside an async IIFE rather than at module top level. The
// build targets es2020 and chrome87, neither of which carries top-level await,
// so a top-level form typechecks and tests green but fails `vite build`.
void (async () => {
  await loadUiStringOverrides();
  createRoot(root).render(<App />);
})();
