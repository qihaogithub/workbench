import fs from "node:fs";
import path from "node:path";

const roots = process.argv.slice(2);

if (roots.length === 0) {
  console.error("Usage: node scripts/check-browser-agent-url-bundle.mjs <bundle-dir> [...bundle-dir]");
  process.exit(1);
}

const forbidden = ["http://localhost:3201", "NEXT_PUBLIC_AGENT_SERVICE_URL"];
const matches = [];

function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(fullPath);
      continue;
    }
    if (!/\.(?:js|html)$/.test(entry.name)) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    for (const value of forbidden) {
      if (source.includes(value)) matches.push(`${fullPath}: ${value}`);
    }
  }
}

for (const root of roots) {
  if (!fs.existsSync(root)) {
    console.error(`Browser bundle directory does not exist: ${root}`);
    process.exit(1);
  }
  inspect(root);
}

if (matches.length > 0) {
  console.error("Browser bundle contains a forbidden agent-service URL override:");
  for (const match of matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log("Browser agent-service URL bundle check passed.");
