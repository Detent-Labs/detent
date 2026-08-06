import { createRoot } from "react-dom/client";
import { App } from "./shell/App.js";
import { loadUiStringOverrides } from "./i18n/overrides.js";
import "form-ui/form-ui.css";
import "./shell/shell.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
// Awaited before the first render, not in an App effect: `resolveOverride`
// reads a module variable React does not observe, so installing the map after
// mount would schedule no re-render and the login screen would keep its builtin
// wording. A failed fetch resolves anyway and leaves the map empty.
await loadUiStringOverrides();
createRoot(root).render(<App />);
