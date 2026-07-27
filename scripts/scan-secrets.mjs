import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

let tracked;
let readContent;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  readContent = (file) => execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
} catch {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "test-results", "playwright-report", ".git"].includes(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if ([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".md", ".sql", ".sh"].includes(extname(entry.name)) || entry.name.startsWith(".")) files.push(relative(process.cwd(), full).replaceAll("\\", "/"));
    }
  };
  walk(process.cwd());
  tracked = files;
  readContent = (file) => readFileSync(file, "utf8");
}
const ignored = new Set(["pnpm-lock.yaml", ".env.example"]);
const isIgnored = (file) => ignored.has(file) || file === ".env" || file === ".env.local" || file.startsWith(".env.");
const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "JWT-like token", regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
];
const findings = [];
for (const file of tracked) {
  if (isIgnored(file) || file.startsWith("implementation/")) continue;
  let content;
  try { content = readContent(file); } catch { continue; }
  for (const pattern of patterns) if (pattern.regex.test(content)) findings.push(`${file}: ${pattern.name}`);
}
if (findings.length) {
  console.error("Possible secrets found (values intentionally omitted):\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Secret scan passed for ${tracked.length} tracked files.`);
