import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const version = "20260831";
const requiredLinks = [
  `<link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=${version}">`,
  `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=${version}">`,
  `<link rel="icon" type="image/x-icon" href="/favicon.ico?v=${version}">`,
  `<link rel="apple-touch-icon" sizes="512x512" href="/favicon-512.png?v=${version}">`,
];

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const location = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      return entry.isDirectory()
        ? findHtmlFiles(location)
        : location.pathname.endsWith(".html")
          ? [location]
          : [];
    }),
  );

  return files.flat();
}

test("every page declares the versioned blue-T favicon set", async () => {
  const htmlFiles = await findHtmlFiles(publicDir);
  assert.ok(htmlFiles.length > 0, "expected at least one public HTML page");

  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const relativePath = path.relative(publicDir.pathname, file.pathname);

    for (const link of requiredLinks) {
      assert.ok(html.includes(link), `${relativePath} is missing ${link}`);
    }
  }
});

test("favicon assets exist and the source artwork is the blue underlined T", async () => {
  for (const filename of ["favicon.svg", "favicon-32.png", "favicon-512.png", "favicon.ico"]) {
    const asset = new URL(filename, publicDir);
    assert.ok((await stat(asset)).size > 0, `${filename} must not be empty`);
  }

  const svg = await readFile(new URL("favicon.svg", publicDir), "utf8");
  assert.match(svg, /Blue underlined letter T/i);
  assert.match(svg, /#0645ad/i);
});
