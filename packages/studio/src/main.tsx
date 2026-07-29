import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./app.css";
import "form-ui/form-ui.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");
createRoot(root).render(<App />);
