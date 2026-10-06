// Checks every lesson and drill in content/. Exit code 1 when something is wrong.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkContent } from "../lib/check-content.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const { errors, warnings, lessons, drills } = checkContent(dir);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`${lessons} lessons, ${drills} drills: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
