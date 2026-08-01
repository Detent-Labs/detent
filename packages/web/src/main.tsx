import { createRoot } from "react-dom/client";
import { App } from "./shell/App.js";
import "form-ui/form-ui.css";
import "./shell/shell.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);
