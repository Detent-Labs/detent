import fs from "fs";
import path from "path";
import { compileProcessBody, ProcessBody } from "../src/schema/compile";

const examplesDir = "./examples";
const files = fs.readdirSync(examplesDir).filter(f => f.endsWith(".json"));

let allPass = true;
for (const file of files) {
  const filePath = path.join(examplesDir, file);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const body = (raw.definition ?? raw) as ProcessBody;
  try {
    compileProcessBody(body);
    console.log(`✓ ${file}`);
  } catch (e) {
    console.log(`✗ ${file}: ${(e as Error).message}`);
    allPass = false;
  }
}

process.exit(allPass ? 0 : 1);
