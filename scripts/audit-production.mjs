import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(new URL(prefix, directory), { withFileTypes: true })) {
    if (entry.name === ".vite" || entry.name === ".DS_Store") continue;
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(directory, `${relative}/`));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/audit-production.mjs REPORT.json");
const origin = "https://theosteiger.com";
const publicFiles = await listFiles(new URL("../public/", import.meta.url));
const draftFiles = await listFiles(new URL("../drafts/", import.meta.url));
const published = new Set(publicFiles);
const files = [...new Set([...publicFiles, ...draftFiles])].sort();
const candidates = [];
for (const file of files) {
  const page = file.endsWith(".html");
  const expected = published.has(file) ? "published" : "offline";
  candidates.push({ path: `/${file}`, kind: page ? "page" : "asset", expected });
  if (file.endsWith("index.html")) {
    const route = `/${file.slice(0, -"index.html".length)}`;
    candidates.push({ path: route, kind: "page", expected });
    if (route !== "/") candidates.push({ path: route.slice(0, -1), kind: "page", expected });
  }
}
candidates.sort((a, b) => a.path.localeCompare(b.path));
const results = new Array(candidates.length);
const checkedAt = new Date().toISOString();
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < candidates.length) {
    const index = next++;
    const candidate = candidates[index];
    const url = new URL(candidate.path, origin);
    url.searchParams.set("inventory", checkedAt);
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: { "Cache-Control": "no-cache" },
          signal: AbortSignal.timeout(15000),
        });
        const destination = new URL(response.url);
        destination.searchParams.delete("inventory");
        result = { ...candidate, status: response.status, finalUrl: destination.href };
        break;
      } catch (error) {
        result = { ...candidate, status: null, error: error.message };
      }
    }
    results[index] = result;
  }
}));
await writeFile(output, `${JSON.stringify({ origin, checkedAt, results }, null, 2)}\n`);
const counts = {};
for (const result of results) counts[result.status ?? "error"] = (counts[result.status ?? "error"] || 0) + 1;
console.log(JSON.stringify({ checked: results.length, statuses: counts, report: output }));
if (results.some((result) => result.status === null)) process.exitCode = 1;
