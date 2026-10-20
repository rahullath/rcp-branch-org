// Runs before every build. The AI import prompt is written from src/lib/import-fields.json;
// this fails the build if the prompt asks for a field the importer never reads (it would be
// silently dropped). The other way round is a type error already (ImportRow).
import { readFileSync } from "node:fs";

const fields = JSON.parse(readFileSync(new URL("../src/lib/import-fields.json", import.meta.url)));
const src = readFileSync(new URL("../src/lib/json-import.ts", import.meta.url), "utf8");
const problems = [];
for (const [module, spec] of Object.entries(fields)) {
  const start = src.indexOf(`list(data, "${module}")`);
  if (start < 0) {
    problems.push(`${module}: the prompt asks for it but json-import.ts never reads it`);
    continue;
  }
  const next = src.indexOf("list(data, \"", start + 1);
  const block = src.slice(start, next < 0 ? undefined : next);
  for (const key of Object.keys(spec)) if (!new RegExp(`\\br\\.${key}\\b`).test(block)) problems.push(`${module}.${key}: in the prompt, never read by the importer`);
}
if (problems.length) {
  console.error("Import prompt and importer are out of step:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Import prompt and importer agree (${Object.keys(fields).length} sections).`);
